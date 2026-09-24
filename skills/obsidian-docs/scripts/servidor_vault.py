#!/usr/bin/env python3
"""Servidor MCP do vault Obsidian: a LLM le e grava a documentacao por aqui.

Zero dependencias: o protocolo MCP (JSON-RPC 2.0 sobre stdio, uma mensagem
por linha) e implementado so com a biblioteca padrao (Python 3.9+). Tudo e
filesystem — o Obsidian nao precisa estar aberto. As convencoes do vault
(pasta por tipo, nome com data, frontmatter, link e entrada no hub, Home,
commit -> pull --rebase -> push) vivem aqui, em codigo, nao na memoria do
modelo.

Registro no Claude Code (uma vez, escopo de usuario — vale em todo projeto):

  python scripts/servidor_vault.py --instalar
  python scripts/servidor_vault.py --instalar --vault <pasta de projetos do vault>

`--instalar` roda o `claude mcp add` com o python e o caminho absoluto certos.
O caminho do vault vem de `OBSIDIAN_VAULT` (a pasta de projetos, a mesma das
skills) ou de `--vault`. Caminho nunca e inventado.

Ferramentas:
  visao_geral     panorama: projetos, contagem por tipo, notas recentes
  contexto_projeto arranque num projeto com teto fixo: hub resumido, notas recentes
                  por secao com resumo, ultima evolucao
  buscar          full-text sem acento/caixa, filtros projeto/tipo/status; cada
                  resultado traz o resumo da nota no hub
  listar_notas    metadados das notas, mais recentes primeiro
  ler_nota        conteudo integral, uma secao (secao=) ou cortado (max_chars=)
  conexoes        notas relacionadas com resumo: wikilinks de saida e backlinks,
                  fora os links estruturais (hub e Home)
  salvar_nota     cria a nota com tudo que a convencao exige (e hub/Home novos)
  atualizar_nota  corpo, status, tags, sucessora (obsoleta) ou resumo no hub
  renomear_nota   move a nota, troca o titulo e reescreve os wikilinks do vault
  dividir_nota    nota grande vira indice + uma nota por secao ao lado (parte_de:)
  mapa_codigo     mapa do codigo (graphify-out do repo, ponteiro Repo: do hub)
  consultar_codigo pergunta ao grafo via CLI graphify (query/explain/path)
  gerar_mapa      regrava a nota Mapa do Codigo preservando a Leitura curada
  validar         linter: frontmatter, vocabulario, wikilinks quebrados, hub, orfas;
                  padrao de nota (A4-A9) contado, e listado com tipo=padrao
  sincronizar     fecha um lote: commit -> pull --rebase -> push de tudo que esta pendente

Vault que e repositorio git: cada gravacao faz commit -> pull --rebase -> push
(desligue com `--sem-git` no registro). Gravacao em lote: salvar_nota e
atualizar_nota com lote=true so escrevem em disco, e `sincronizar` fecha o lote
num commit so. Leitura em cache: cada arquivo e relido, normalizado e tem os
wikilinks extraidos apenas quando mtime ou tamanho mudam; backlinks e resumos
dos hubs sao indices derivados, refeitos so quando alguma nota muda; o vault e
pre-aquecido numa thread logo apos o initialize. Autoteste:
scripts/teste_servidor_vault.py
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import unicodedata
from collections import Counter, defaultdict

PROTOCOLOS = {"2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"}
PROTOCOLO_PADRAO = "2025-06-18"
IGNORAR = {".obsidian", ".scripts", ".git"}
# [[alvo]] e [[alvo|texto]]; blocos e trechos de codigo nao contam como link
WIKILINK_RE = re.compile(r"\[\[([^\]\[|#]+)")
CODEBLOCK_RE = re.compile(r"```.*?```", re.S)
INLINECODE_RE = re.compile(r"`[^`\n]+`")
DATA_RE = re.compile(r"\d{4}-\d{2}-\d{2}")

VAULT = None  # resolvido em main()
SEM_GIT = False  # --sem-git: nunca commita nem empurra o vault


class ErroUso(Exception):
    """Chamada invalida: vira texto de erro para o modelo, nunca derruba o servidor."""

INSTRUCOES = (
    "Vault Obsidian com a documentacao dos projetos (specs, planos, ADRs, bugs, "
    "evolucoes, analises). Estrutura: Home.md -> <projeto>/<projeto>.md (hub) -> "
    "Specs/, Arquitetura/, Bugs/, Evolucoes/, Analises/. Ler: visao_geral, "
    "contexto_projeto (arranque num projeto, com teto: use no lugar do hub inteiro), "
    "buscar, listar_notas, ler_nota (secao= quando so uma parte importa), conexoes "
    "(relacionadas com resumo). Gravar: salvar_nota (nota nova; faz pasta, "
    "nome, frontmatter, hub, Home e git) e atualizar_nota (nota existente). Reorganizar: "
    "renomear_nota (reescreve os wikilinks), dividir_nota (nota grande vira indice + anexos). "
    "Codigo: mapa_codigo (antes de mexer no projeto), consultar_codigo (arquitetura), "
    "gerar_mapa (apos o graphify); salvar_nota aceita arquivos= para citar componentes. "
    "Muitas notas de uma vez (migracao, tickets): lote=true em cada gravacao e "
    "sincronizar uma vez no fim. validar: linter do vault (rode ao fechar uma leva). "
    "Nunca escreva ou leia os arquivos do vault por fora destas ferramentas."
)

ERRO_VAULT = (
    "Vault nao configurado. Defina OBSIDIAN_VAULT apontando para a pasta de "
    'projetos do vault (ex.: export OBSIDIAN_VAULT="$HOME/obsidian/projetos") e '
    "reinicie o servidor MCP, ou registre-o com `--vault <caminho>` no fim do "
    "comando. O caminho nunca e inventado: pergunte ao usuario onde fica."
)


# ---------- leitura do vault ----------

# caminho -> (mtime_ns, tamanho, nota). O os.walk roda a cada chamada (e barato);
# o que custa e ler, parsear e normalizar cada arquivo, e isso so acontece quando
# ele mudou. _VERSAO sobe a cada mudanca no conjunto de notas: e o que diz aos
# indices derivados (backlinks, resumos dos hubs) quando se refazer.
_CACHE = {}
_VERSAO = 0
# O pre-aquecimento (apos o initialize) roda numa thread; a primeira chamada de
# ferramenta espera nele em vez de repetir a varredura por cima.
_TRANCA = threading.RLock()


def notas():
    """Todas as notas .md do vault, com frontmatter ja separado e, calculados uma
    vez por versao do arquivo, o texto e o nome normalizados e os wikilinks.
    Antes, buscar e conexoes refaziam isso em todas as notas a cada chamada."""
    with _TRANCA:
        return _notas()


def _notas():
    global _VERSAO
    lista, vivos, mudou = [], set(), False
    for raiz, dirs, arqs in os.walk(VAULT):
        dirs[:] = sorted(d for d in dirs if d not in IGNORAR)
        for a in sorted(arqs):
            if not a.lower().endswith(".md"):
                continue
            caminho = os.path.join(raiz, a)
            try:
                st = os.stat(caminho)
            except OSError:
                continue
            vivos.add(caminho)
            guardado = _CACHE.get(caminho)
            if guardado and guardado[0] == st.st_mtime_ns and guardado[1] == st.st_size:
                lista.append(guardado[2])
                continue
            try:
                with open(caminho, encoding="utf-8") as f:
                    texto = f.read()
            except (OSError, UnicodeDecodeError):
                if _CACHE.pop(caminho, None) is not None:
                    mudou = True
                continue
            rel = os.path.relpath(caminho, VAULT).replace(os.sep, "/")
            partes = rel.split("/")
            nome = os.path.splitext(a)[0]
            nota = {
                "rel": rel,
                "nome": nome,
                "projeto": partes[0] if len(partes) > 1 else None,
                "fm": frontmatter(texto) or {},
                "texto": texto,
                "mtime": st.st_mtime,
                "norm": normalizar(texto),
                "nome_norm": normalizar(nome),
                "rel_norm": normalizar(rel[:-3]),
                "projeto_norm": normalizar(partes[0]) if len(partes) > 1 else None,
                "links": links_de(texto),
            }
            _CACHE[caminho] = (st.st_mtime_ns, st.st_size, nota)
            lista.append(nota)
            mudou = True
    for caminho in [c for c in _CACHE if c not in vivos]:
        del _CACHE[caminho]
        mudou = True
    if mudou:
        _VERSAO += 1
    return lista


def frontmatter(texto):
    if not texto.startswith("---"):
        return None
    fim = texto.find("\n---", 3)
    if fim == -1:
        return None
    campos = {}
    for linha in texto[3:fim].splitlines():
        if ":" in linha and not linha.startswith((" ", "-", "\t")):
            k, _, v = linha.partition(":")
            campos[k.strip()] = v.strip()
    return campos


def corpo_de(nota):
    """Texto da nota sem o frontmatter (para trechos legiveis)."""
    texto = nota["texto"]
    if texto.startswith("---"):
        fim = texto.find("\n---", 3)
        if fim != -1:
            return texto[fim + 4:].lstrip("\n")
    return texto


def data_de(nota):
    d = str(nota["fm"].get("data", ""))
    m = DATA_RE.search(d)
    if m:
        return m.group(0)
    return time.strftime("%Y-%m-%d", time.localtime(nota["mtime"]))


def sem_codigo(texto):
    return INLINECODE_RE.sub("", CODEBLOCK_RE.sub("", texto))


def links_de(texto):
    return {a.strip() for a in WIKILINK_RE.findall(sem_codigo(texto)) if a.strip()}


# ---------- indices derivados ----------

# `- [[nome]] — resumo` (o servidor escreve com travessao; hub a mao usa `-` ou `:`)
HUB_LINHA_RE = re.compile(r"^[-*] \[\[([^\]\[|#]+)(?:[|#][^\]]*)?\]\][ \t]*(?:[—–:-][ \t]*)?(.*)$")
HEADING_RE = re.compile(r"^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$")
# Refeito so quando _VERSAO muda: backlinks e resumos custavam uma varredura do
# vault inteiro por chamada de conexoes.
_INDICE = {"versao": None}


def nome_alvo(link):
    """[[Specs/2026-01-10 X]] aponta para a nota `2026-01-10 X`: o alvo e o nome."""
    return link.rsplit("/", 1)[-1].strip()


def eh_hub(n):
    return (n["fm"].get("tipo") == "hub" or n["rel"] == "Home.md"
            or bool(n["projeto"] and n["rel"] == f"{n['projeto']}/{n['projeto']}.md"))


def hub_de(n):
    """rel do hub que lista a nota: o do projeto; Home para um hub."""
    if eh_hub(n):
        return "Home.md"
    return f"{n['projeto']}/{n['projeto']}.md" if n["projeto"] else None


def resumos_do_hub(texto):
    """nome da nota -> resumo, das linhas `- [[nome]] — resumo` de um hub."""
    saida = {}
    for linha in CODEBLOCK_RE.sub("", texto).split("\n"):
        m = HUB_LINHA_RE.match(linha)
        if m and m.group(2).strip():
            saida.setdefault(nome_alvo(m.group(1)), m.group(2).strip())
    return saida


def indice(todas):
    """Sobre a lista que notas() acabou de devolver: por_nome (nome -> rel, a
    primeira ganha), backlinks (nome -> [rel]) e resumos (rel do hub -> {nome: resumo})."""
    global _INDICE
    if _INDICE["versao"] == _VERSAO:
        return _INDICE
    por_nome, backlinks, resumos = {}, defaultdict(list), {}
    for n in todas:
        por_nome.setdefault(n["nome"], n["rel"])
        for alvo in {nome_alvo(l) for l in n["links"]}:
            backlinks[alvo].append(n["rel"])
        if eh_hub(n):
            resumos[n["rel"]] = resumos_do_hub(n["texto"])
    _INDICE = {"versao": _VERSAO, "por_nome": por_nome,
               "backlinks": dict(backlinks), "resumos": resumos}
    return _INDICE


def resumo_de(n, idx):
    """A linha curada que o hub guarda sobre a nota; None se ela nao esta listada."""
    return idx["resumos"].get(hub_de(n), {}).get(n["nome"])


def secoes_de(corpo):
    """([(nivel, titulo, linha_ini, linha_fim)], linhas): cabecalhos fora de blocos
    de codigo; a secao vai ate o proximo cabecalho de nivel igual ou superior."""
    linhas = corpo.split("\n")
    cabecalhos, em_codigo = [], False
    for i, l in enumerate(linhas):
        if l.lstrip().startswith("```"):
            em_codigo = not em_codigo
            continue
        if em_codigo:
            continue
        m = HEADING_RE.match(l)
        if m:
            cabecalhos.append((len(m.group(1)), m.group(2).strip(), i))
    secoes = []
    for k, (nivel, titulo, ini) in enumerate(cabecalhos):
        fim = next((c[2] for c in cabecalhos[k + 1:] if c[0] <= nivel), len(linhas))
        secoes.append((nivel, titulo, ini, fim))
    return secoes, linhas


def paragrafo_de_abertura(corpo, teto=400):
    """Primeiro paragrafo de prosa: pula titulo, `Projeto: [[x]]`, `Substituida por`,
    listas, tabelas e codigo. E o que uma evolucao promete abrir com."""
    for bloco in re.split(r"\n[ \t]*\n", corpo):
        b = " ".join(bloco.split())
        if not b or b.startswith(("#", "Projeto: [[", "Substituída por", "Repo:", "- ", "* ",
                                  "|", "```", ">", "![")):
            continue
        return b if len(b) <= teto else b[:teto].rsplit(" ", 1)[0] + "…"
    return ""


def cortar(texto, max_chars):
    """Corta no fim de linha antes de max_chars e diz quanto ficou de fora."""
    try:
        teto = int(max_chars)
    except (TypeError, ValueError):
        return texto
    if teto < 200 or len(texto) <= teto:
        return texto
    corte = texto.rfind("\n", 0, teto)
    corte = corte if corte > teto // 2 else teto
    return (texto[:corte] + f"\n… (cortado em {corte} de {len(texto)} caracteres; "
            "ler_nota sem max_chars, ou com secao=, para o resto)")


# ---------- busca ----------

# Marcas combinantes (categoria Mn) do plano basico, tiradas por regex em C: a
# versao caractere a caractere em Python custava 4x mais no vault inteiro.
MARCAS_RE = re.compile("[" + "".join(re.escape(chr(c)) for c in range(0x10000)
                                     if unicodedata.category(chr(c)) == "Mn") + "]")


def normalizar(s):
    return MARCAS_RE.sub("", unicodedata.normalize("NFD", str(s))).casefold()


def norm_com_mapa(s):
    """Versao normalizada + mapa de indice normalizado -> indice original."""
    saida, mapa = [], []
    for i, c in enumerate(s):
        for d in unicodedata.normalize("NFD", c):
            if unicodedata.category(d) == "Mn":
                continue
            for e in d.casefold():
                saida.append(e)
                mapa.append(i)
    return "".join(saida), mapa


def trecho(texto, termos):
    """Contexto ao redor da primeira ocorrencia de um dos termos."""
    norm, mapa = norm_com_mapa(texto)
    for termo in termos:
        pos = norm.find(termo)
        if pos < 0 or not mapa:
            continue
        ini = mapa[pos]
        fim = mapa[min(pos + len(termo), len(mapa)) - 1] + 1
        a, b = max(0, ini - 90), min(len(texto), fim + 90)
        t = " ".join(texto[a:b].split())
        return ("…" if a > 0 else "") + t + ("…" if b < len(texto) else "")
    return ""


def valores(v):
    return [normalizar(x.strip()) for x in str(v or "").split("|")]


def filtrar(todas, projeto=None, tipo=None, status=None):
    sel = todas
    if projeto:
        p = normalizar(projeto)
        sel = [n for n in sel if n["projeto_norm"] == p]
    if tipo:
        t = normalizar(tipo)
        sel = [n for n in sel if t in valores(n["fm"].get("tipo"))]
    if status:
        s = normalizar(status)
        sel = [n for n in sel if s in valores(n["fm"].get("status"))]
    return sel


def rotulo_filtros(projeto, tipo, status):
    partes = [f"{k}={v}" for k, v in
              (("projeto", projeto), ("tipo", tipo), ("status", status)) if v]
    return " [" + ", ".join(partes) + "]" if partes else ""


def inteiro(v, padrao, teto):
    try:
        return max(1, min(int(v), teto))
    except (TypeError, ValueError):
        return padrao


def linha_meta(n):
    fm = n["fm"]
    proj = fm.get("projeto", n["projeto"] or "-")
    return (f"projeto: {proj} | tipo: {fm.get('tipo', '-')} | "
            f"status: {fm.get('status', '-')} | data: {data_de(n)}")


def achar(ref, todas):
    """Resolve caminho relativo ou nome de nota -> (nota, candidatos)."""
    ref = str(ref).strip().strip("/").replace("\\", "/")
    base = ref[:-3] if ref.lower().endswith(".md") else ref
    nr = normalizar(base)
    if not nr:
        return None, None
    for grupo in (
        [n for n in todas if n["rel"] == ref or n["rel"] == base + ".md"
         or n["nome"] == base],
        [n for n in todas if n["nome_norm"] == nr or n["rel_norm"] == nr],
        [n for n in todas if nr in n["nome_norm"]],
    ):
        if len(grupo) == 1:
            return grupo[0], None
        if grupo:
            return None, grupo
    return None, None


# ---------- ferramentas ----------

def visao_geral():
    todas = notas()
    if not todas:
        return f"Vault vazio (nenhuma nota .md em {VAULT})."
    projetos = defaultdict(list)
    for n in todas:
        if n["projeto"]:
            projetos[n["projeto"]].append(n)
    linhas = [f"Vault: {VAULT}",
              f"{len(projetos)} projeto(s), {len(todas)} nota(s)", ""]
    so_hub = []
    for proj in sorted(projetos):
        ns = projetos[proj]
        if len(ns) == 1 and eh_hub(ns[0]):
            so_hub.append(proj)  # projeto sem nota: uma linha para todos, no fim
            continue
        tipos = Counter(n["fm"].get("tipo") or "?" for n in ns)
        det = ", ".join(f"{t}: {c}" for t, c in sorted(tipos.items()))
        hub = "" if any(n["nome"] == proj for n in ns) else " | SEM HUB"
        linhas.append(f"- {proj} — {len(ns)} nota(s) ({det}){hub}")
    if so_hub:
        linhas.append(f"- {len(so_hub)} projeto(s) so com hub, sem notas: " + ", ".join(so_hub))
    recentes = sorted(todas, key=data_de, reverse=True)[:6]
    linhas += ["", "Recentes:"]
    linhas += [f"- {data_de(n)}  {n['rel']}" for n in recentes]
    return "\n".join(linhas)


def curto(s, teto=200):
    s = " ".join(str(s).split())
    return s if len(s) <= teto else s[:teto].rsplit(" ", 1)[0] + "…"


def buscar(consulta="", projeto=None, tipo=None, status=None, limite=None):
    termos = [normalizar(t) for t in str(consulta).split() if t]
    if not termos:
        return "Informe a consulta (um ou mais termos; todos precisam aparecer)."
    limite = inteiro(limite, 10, 30)
    todas = notas()
    achadas = []
    for n in filtrar(todas, projeto, tipo, status):
        titulo, corpo = n["nome_norm"], n["norm"]
        if not all(t in titulo or t in corpo for t in termos):
            continue
        pontos = sum(5 for t in termos if t in titulo)
        pontos += sum(corpo.count(t) for t in termos)
        achadas.append((pontos, n))
    filtros = rotulo_filtros(projeto, tipo, status)
    if not achadas:
        return (f'Nenhuma nota para "{consulta}"{filtros}. Tente menos termos, '
                "sem filtros, ou visao_geral para ver o que existe.")
    achadas.sort(key=lambda par: (-par[0], par[1]["rel"]))
    idx = indice(todas)
    linhas = [f'{len(achadas)} nota(s) para "{consulta}"{filtros}'
              + (f", mostrando {limite}:" if len(achadas) > limite else ":")]
    for _, n in achadas[:limite]:
        linhas.append(f"\n- {n['rel']}\n  {linha_meta(n)}")
        # a linha curada do hub diz o que a nota E; o trecho so diz onde o termo caiu
        resumo = resumo_de(n, idx)
        if resumo:
            linhas.append(f"  {curto(resumo)}")
        else:
            t = trecho(corpo_de(n), termos)
            if t:
                linhas.append(f'  "{t}"')
    return "\n".join(linhas)


def listar_notas(projeto=None, tipo=None, status=None, limite=None):
    limite = inteiro(limite, 20, 100)
    sel = filtrar(notas(), projeto, tipo, status)
    filtros = rotulo_filtros(projeto, tipo, status)
    if not sel:
        return (f"Nenhuma nota{filtros}. Confira os nomes com visao_geral "
                "(projeto = nome da pasta; tipo/status como no frontmatter).")
    sel.sort(key=data_de, reverse=True)
    linhas = [f"{min(limite, len(sel))} de {len(sel)} nota(s){filtros}, "
              "mais recentes primeiro:"]
    linhas += [f"- {n['rel']}\n  {linha_meta(n)}" for n in sel[:limite]]
    return "\n".join(linhas)


def resolver(nota, todas):
    """(nota, None) ou (None, orientacao). Nas leituras a orientacao volta como
    resultado, nao como erro — de proposito: nota ausente nao e falha da chamada."""
    alvo, candidatos = achar(nota, todas)
    if alvo:
        return alvo, None
    if candidatos:
        linhas = [f'Mais de uma nota bate com "{nota}" — repita com o caminho:']
        linhas += [f"- {n['rel']}" for n in candidatos[:10]]
        if len(candidatos) > 10:
            linhas.append(f"… e mais {len(candidatos) - 10}")
        return None, "\n".join(linhas)
    return None, (f'Nota nao encontrada: "{nota}". Aceito caminho relativo ao vault '
                  "ou o nome como em wikilink; use buscar ou listar_notas para achar.")


TETO_NOTA = 40000  # caracteres: acima disto, ler integral custa mais de 10 mil tokens


def esboco(alvo):
    """Nota grande: abertura e cabecalhos com o tamanho de cada secao, para escolher."""
    corpo = corpo_de(alvo)
    secoes, linhas = secoes_de(corpo)
    saida = [f"Caminho: {alvo['rel']}",
             f"Nota grande ({len(alvo['texto'])} caracteres): escolha secao=<titulo>, "
             "corte com max_chars=N ou peca integral=true.", ""]
    abertura = paragrafo_de_abertura(corpo)
    if abertura:
        saida += [abertura, ""]
    secoes = [s for s in secoes if s[0] > 1]  # o `# titulo` e a nota inteira
    saida.append("Secoes:" if secoes else "Sem cabecalhos alem do titulo.")
    saida += [f"- {'#' * nivel} {titulo} ({sum(len(l) + 1 for l in linhas[ini:fim])} caracteres)"
              for nivel, titulo, ini, fim in secoes]
    return "\n".join(saida)


def ler_nota(nota="", secao=None, max_chars=None, integral=False):
    alvo, erro = resolver(nota, notas())
    if erro:
        return erro
    pedido = normalizar(str(secao or "").lstrip("#").strip())
    if not pedido:
        if len(alvo["texto"]) > TETO_NOTA and not integral and max_chars is None:
            return esboco(alvo)
        return f"Caminho: {alvo['rel']}\n\n" + cortar(alvo["texto"], max_chars)
    secoes, linhas = secoes_de(corpo_de(alvo))
    for grupo in ([s for s in secoes if normalizar(s[1]) == pedido],
                  [s for s in secoes if normalizar(s[1]).startswith(pedido)],
                  [s for s in secoes if pedido in normalizar(s[1])]):
        if len(grupo) == 1:
            nivel, titulo, ini, fim = grupo[0]
            bloco = "\n".join(linhas[ini:fim]).rstrip("\n")
            return (f"Caminho: {alvo['rel']}\nSecao: {'#' * nivel} {titulo}\n\n"
                    + cortar(bloco, max_chars))
        if grupo:
            return (f'Mais de uma secao bate com "{secao}" em {alvo["rel"]}; repita com o '
                    "titulo exato: " + "; ".join(f"{'#' * n} {t}" for n, t, _, _ in grupo))
    disponiveis = ", ".join(f"{'#' * n} {t}" for n, t, _, _ in secoes) or "nenhuma"
    return f'Secao "{secao}" nao existe em {alvo["rel"]}. Secoes: {disponiveis}'


def conexoes(nota=""):
    todas = notas()
    alvo, erro = resolver(nota, todas)
    if erro:
        return erro
    idx = indice(todas)
    por_nome, por_rel = idx["por_nome"], {n["rel"]: n for n in todas}
    proj, hub_rel, hub = alvo["projeto"], hub_de(alvo), eh_hub(alvo)

    mae = alvo["fm"].get("parte_de")

    def estrutural(rel):
        """Link que a convencao gera sozinha: nota <-> hub do projeto, hub <-> Home,
        nota-mae <-> anexo."""
        if rel in ("Home.md", hub_rel):
            return True
        outra = por_rel.get(rel)
        if not outra:
            return False
        if outra["fm"].get("parte_de") == alvo["nome"] or (mae and outra["nome"] == mae):
            return True
        return bool(hub and (outra["projeto"] == proj or (proj is None and eh_hub(outra))))

    def linha(rel):
        r = resumo_de(por_rel[rel], idx)
        return f"- {rel}" + (f" — {curto(r)}" if r else "")

    saida, quebrados, proprias = [], [], 0
    for link in sorted(alvo["links"]):
        rel = por_nome.get(nome_alvo(link))
        if rel is None:
            quebrados.append(link)
        elif estrutural(rel):
            if rel not in ("Home.md", hub_rel):
                proprias += 1  # nota do proprio projeto, listada por este hub
        elif rel != alvo["rel"]:
            saida.append(rel)
    backlinks = idx["backlinks"].get(alvo["nome"], [])
    entrada = [r for r in sorted(backlinks) if r != alvo["rel"] and not estrutural(r)]
    linhas = [f"Nota: {alvo['rel']}"]
    if hub and proj:
        linhas.append(f"Hub de {proj}: {proprias} nota(s) do projeto listadas "
                      f"(contexto_projeto {proj} para ve-las)")
    elif not hub and hub_rel:
        linhas.append(f"Hub: [[{proj}]] (" + ("lista esta nota" if hub_rel in backlinks
                                               else "NAO lista esta nota: validar aponta") + ")")
    anexos = sum(1 for n in todas if n["fm"].get("parte_de") == alvo["nome"])
    if anexos:
        linhas.append(f"Anexos: {anexos} (o indice esta na propria nota)")
    if mae:
        linhas.append(f"Parte de [[{mae}]]")
    linhas.append(f"Relacionadas de saida ({len(saida) + len(quebrados)}):"
                  if saida or quebrados else "Relacionadas de saida: nenhuma alem de hub/Home")
    linhas += [linha(r) for r in saida]
    linhas += [f"- [[{l}]] (sem arquivo no vault)" for l in quebrados]
    linhas.append(f"Backlinks ({len(entrada)}):" if entrada else "Backlinks: nenhum alem de hub/Home")
    linhas += [linha(r) for r in entrada]
    return "\n".join(linhas)


TETO_CONTEXTO = 3000
PENDENCIAS = ("pendencias", "em aberto", "proximos passos")


def secao_por_nome(corpo, nomes, teto):
    """(titulo, bloco ate teto caracteres) da primeira secao com um destes titulos."""
    secoes, linhas = secoes_de(corpo)
    for nivel, titulo, ini, fim in secoes:
        if normalizar(titulo) in nomes:
            bloco = "\n".join(l for l in linhas[ini + 1:fim] if l.strip())
            if len(bloco) > teto:
                bloco = bloco[:teto].rsplit("\n", 1)[0] + "\n…"
            return titulo, bloco
    return None


def contexto_projeto(projeto="", por_secao=None):
    """Arranque num projeto com teto fixo: o que o hook pedia em tres leituras."""
    por_secao = inteiro(por_secao, 3, 10)
    todas = notas()
    p = normalizar(str(projeto).strip())
    hub = next((n for n in todas if n["projeto"] and n["projeto_norm"] == p
                and n["rel"] == f"{n['projeto']}/{n['projeto']}.md"), None)
    if hub is None:
        hubs = sorted({n["projeto"] for n in todas
                       if n["projeto"] and n["rel"] == f"{n['projeto']}/{n['projeto']}.md"})
        parecidos = [h for h in hubs if p and (p in normalizar(h) or normalizar(h) in p)]
        raise ErroUso(f'projeto "{projeto}" nao tem hub no vault.'
                      + (f" Parecidos: {', '.join(parecidos)}." if parecidos else "")
                      + " visao_geral lista os que existem.")
    proj = hub["projeto"]
    idx = indice(todas)
    resumos = idx["resumos"].get(hub["rel"], {})
    por_rel = {n["rel"]: n for n in todas}
    do_projeto = [n for n in todas if n["projeto"] == proj and n is not hub]
    por_nome = {n["nome"]: n for n in do_projeto}
    corpo = corpo_de(hub)
    tipos = Counter(valores(n["fm"].get("tipo"))[0] or "?" for n in do_projeto)
    status = Counter(valores(n["fm"].get("status"))[0] or "?" for n in do_projeto)
    saida = [f"Projeto: {proj} ({hub['rel']})"]
    descricao = paragrafo_de_abertura(REPO_RE.sub("", corpo), 300)
    if descricao:
        saida.append(descricao)
    m = REPO_RE.search(hub["texto"])
    if m:
        saida.append(f"Repo: {caminho_da_linha(m.group(1))}")
    saida.append(f"Notas: {len(do_projeto)} ("
                 + ", ".join(f"{t}: {c}" for t, c in tipos.most_common()) + ") | status: "
                 + ", ".join(f"{s}: {c}" for s, c in status.most_common()))
    mapa = f"Mapa do Codigo {proj}"
    if mapa in por_nome:
        saida.append(f"Mapa: [[{mapa}]] (mapa_codigo {proj} le o grafo atual; "
                     "ler_nota secao='Leitura curada' traz so a parte curada)")
    evolucoes = sorted((n for n in do_projeto if "evolucao" in valores(n["fm"].get("tipo"))),
                       key=data_de, reverse=True)
    if evolucoes:  # antes das secoes: se o teto cortar, cai o fim do indice, nao isto
        ult = evolucoes[0]
        r = resumos.get(ult["nome"])
        saida += ["", f"Ultima evolucao: [[{ult['nome']}]] ({data_de(ult)}, "
                      f"{ult['fm'].get('status', '-')})" + (f" — {curto(r)}" if r else "")]
        corpo_ult = corpo_de(ult)
        abertura = paragrafo_de_abertura(corpo_ult)
        if abertura:
            saida.append("  " + abertura)
        pend = secao_por_nome(corpo_ult, PENDENCIAS, 600)
        if pend:
            saida.append(f"  {pend[0]}:")
            saida += ["  " + l for l in pend[1].split("\n")]
    secoes, linhas = secoes_de(corpo)
    for nivel, titulo, ini, fim in secoes:
        if nivel != 2:
            continue
        nomes = [nome_alvo(mm.group(1)) for mm in map(HUB_LINHA_RE.match, linhas[ini + 1:fim]) if mm]
        if not nomes:
            continue
        ns = [n for n in (por_nome.get(x) or por_rel.get(idx["por_nome"].get(x)) for x in nomes) if n]
        ns.sort(key=data_de, reverse=True)
        mostrar = ns[:por_secao]
        saida += ["", f"{titulo} ({len(nomes)}"
                      + (f", {len(mostrar)} mais recentes" if len(nomes) > len(mostrar) else "") + "):"]
        for n in mostrar:
            r = resumos.get(n["nome"])
            saida.append(f"- [[{n['nome']}]]" + (f" — {curto(r)}" if r else ""))
        if len(ns) < len(nomes):
            saida.append(f"- ({len(nomes) - len(ns)} entrada(s) do hub sem nota no vault; validar aponta)")
    texto = "\n".join(saida)
    if len(texto) > TETO_CONTEXTO:
        corte = texto.rfind("\n", 0, TETO_CONTEXTO)
        texto = texto[:corte] + (f"\n… (cortado em {TETO_CONTEXTO} caracteres; listar_notas "
                                 f"projeto={proj} tipo=<tipo> lista uma secao inteira)")
    return texto


# ---------- escrita ----------

TIPOS = {"spec", "plano", "bug", "evolucao", "arquitetura", "adr", "analise", "mapa"}
STATUS = {"rascunho", "ativo", "resolvido", "obsoleto"}
PASTAS = {"spec": "Specs", "plano": "Specs", "bug": "Bugs", "evolucao": "Evolucoes",
          "arquitetura": "Arquitetura", "adr": "Arquitetura", "analise": "Analises"}
# Alem do que o SO proibe, `# ^ [ ]` e a crase: no nome, eles quebram o wikilink que
# aponta a nota (a crase porque links_de tira trechos de codigo antes de ler os links).
NOME_PROIBIDO_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f#^\[\]`]')
SUBSTITUIDA_RE = re.compile(r"^Substituída por \[\[[^\]]*\]\]\.\n+")
PREFIXO_DATA_RE = re.compile(r"^\d{4}-\d{2}-\d{2} ")


def hoje():
    return time.strftime("%Y-%m-%d")


def nome_seguro(s):
    """Nome de arquivo/pasta valido em qualquer SO (acentos ficam)."""
    return " ".join(NOME_PROIBIDO_RE.sub("", str(s)).split()).rstrip(".")


def nome_de_nota(ref):
    return nome_seguro(re.sub(r"\.md$", "", str(ref).strip(), flags=re.I))


def ler(caminho):
    with open(caminho, encoding="utf-8") as f:
        return f.read().replace("\r\n", "\n")


def escrever(caminho, texto):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "w", encoding="utf-8", newline="\n") as f:
        f.write(texto)
    if _LOTE is not None:
        _LOTE.append(caminho)


def lista_tags(tags):
    """kebab-case sem acento, como a skill pede: `Cobrança Recorrente` -> cobranca-recorrente."""
    if isinstance(tags, str):
        tags = tags.split(",")
    saida = []
    for t in tags or []:
        t = re.sub(r"[\s_]+", "-", normalizar(nome_seguro(t))).strip("-")
        if t and t not in saida:
            saida.append(t)
    return saida


def bloco_frontmatter(projeto, tipo, status, data, tags):
    return (f"---\nprojeto: {projeto}\ntipo: {tipo}\nstatus: {status}\n"
            f"data: {data}\ntags: [{', '.join(lista_tags(tags))}]\n---\n")


def com_cabecalho(corpo, titulo, projeto):
    """Garante `# titulo` e o link do hub no corpo — nenhuma nota nasce orfa."""
    corpo = str(corpo).strip("\n")
    if not corpo.lstrip().startswith("# "):
        corpo = f"# {titulo}\n\n{corpo}"
    if f"[[{projeto}]]" not in corpo and f"[[{projeto}|" not in corpo:
        h1, _, resto = corpo.partition("\n")
        corpo = f"{h1}\n\nProjeto: [[{projeto}]]\n\n{resto.lstrip(chr(10))}".rstrip("\n")
    return corpo


def inserir_na_secao(texto, secao, linha, ordenar=False):
    """Poe a linha (bullet com wikilink) na secao `## secao`; cria a secao no fim
    se faltar. O wikilink ja esta na secao -> texto intacto."""
    alvo = WIKILINK_RE.search(linha).group(1).strip()
    linhas = texto.rstrip("\n").split("\n")
    ini = next((i for i, l in enumerate(linhas) if l.startswith("## ")
                and normalizar(l[3:]) == normalizar(secao)), None)
    if ini is None:
        return "\n".join(linhas + ["", f"## {secao}", "", linha]) + "\n"
    fim = next((i for i in range(ini + 1, len(linhas)) if linhas[i].startswith("#")),
               len(linhas))
    if any(f"[[{alvo}]]" in l or f"[[{alvo}|" in l for l in linhas[ini + 1:fim]):
        return texto
    bullets = [i for i in range(ini + 1, fim) if linhas[i].startswith("- ")]
    if not bullets:
        conteudo = [l for l in linhas[ini + 1:fim] if l.strip()]
        linhas[ini + 1:fim] = [""] + conteudo + [linha] + ([""] if fim < len(linhas) else [])
        return "\n".join(linhas) + "\n"
    pos = bullets[-1] + 1
    if ordenar:
        for i in bullets:
            m = WIKILINK_RE.search(linhas[i])
            if m and normalizar(m.group(1)) > normalizar(alvo):
                pos = i
                break
    linhas.insert(pos, linha)
    return "\n".join(linhas) + "\n"


def git_em(pasta, *args):
    r = subprocess.run(["git", "-C", pasta, *args], capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    return r.returncode, (r.stdout + r.stderr).strip()


def git(*args):
    return git_em(VAULT, *args)


def vault_com_git():
    if SEM_GIT or not shutil.which("git"):
        return False
    return git("rev-parse", "--is-inside-work-tree")[0] == 0


def puxar():
    """Antes de escrever: outras maquinas e sessoes tambem gravam no vault."""
    if vault_com_git():
        git("pull", "--rebase", "--autostash")  # offline ou sem upstream: segue local


# Lote aberto: None = nenhum; lista = caminhos que o lote ja escreveu. Serve a
# duas coisas — puxar UMA vez (senao o lote inteiro e construido sobre uma arvore
# velha, e a checagem de duplicata nao ve a nota que outra maquina ja empurrou) e
# commitar SO o que o lote tocou (senao o `add -A` do fim leva junto o que outra
# sessao gravou no vault durante os minutos em que o lote ficou aberto).
_LOTE = None


def abrir_lote():
    global _LOTE
    if _LOTE is None:
        puxar()
        _LOTE = []


def sincronizar(mensagem, caminhos=None):
    """commit -> pull --rebase -> push. Falha vira texto; a nota ja esta gravada."""
    if not vault_com_git():
        return "sem git (vault nao e repositorio, ou --sem-git)"
    if caminhos:
        git("add", "--", *caminhos)
    else:
        git("add", "-A")
    rc, saida = git("commit", "-q", "-m", mensagem)
    if rc != 0:
        return "nada a commitar" if "nothing to commit" in saida else f"commit falhou: {saida[-300:]}"
    if not git("remote")[1]:
        return "commit local (vault sem remoto)"
    rc, saida = git("pull", "--rebase", "--autostash")
    if rc != 0:
        git("rebase", "--abort")
        return f"commit local; pull --rebase falhou: {saida[-300:]}"
    rc, saida = git("push")
    return "commit + push ok" if rc == 0 else f"commit local; push falhou: {saida[-300:]}"


def garantir_home():
    caminho = os.path.join(VAULT, "Home.md")
    if not os.path.exists(caminho):
        escrever(caminho, bloco_frontmatter("vault", "hub", "ativo", hoje(), ["hub"])
                 + "\n# Home\n\nVault de documentação de todos os projetos. "
                   "Um hub por projeto abaixo.\n\n## Projetos\n")


def garantir_hub(projeto, descricao, repo):
    """Hub existente sempre ganha. Projeto novo exige descricao (1 linha)."""
    caminho = os.path.join(VAULT, projeto, projeto + ".md")
    if os.path.exists(caminho):
        return False
    descricao = " ".join(str(descricao or "").split()).rstrip(".")
    if not descricao:
        raise ErroUso(f'projeto "{projeto}" nao existe no vault. E novo mesmo? Confira com '
                      "visao_geral (hub existente sempre ganha) e, se for novo, passe "
                      "descricao_projeto (1 linha) e repo (caminho local do repositorio).")
    corpo = f"\n# {projeto}\n\n{descricao}. Hub global: [[Home]].\n"
    if repo:
        corpo += f"Repo: {repo}\n"
    escrever(caminho, bloco_frontmatter(projeto, "hub", "ativo", hoje(), ["hub"]) + corpo)
    garantir_home()
    home = os.path.join(VAULT, "Home.md")
    escrever(home, inserir_na_secao(ler(home), "Projetos",
                                    f"- [[{projeto}]] — {descricao}", ordenar=True))
    return True


LOTE_PENDENTE = "pendente (lote): chame sincronizar ao fim do lote"

# ---------- padrao de nota ----------
# Medido no vault real: 257 de 310 evolucoes sem as tres secoes, 218 resumos de hub
# acima de 200 caracteres, 72 nomes acima de 90. O padrao avisa ao salvar e e a
# familia `padrao` do validar; nunca recusa.

SECOES_PADRAO = {
    "evolucao": ("O que mudou", "Verificação", "Pendências"),
    "bug": ("Sintoma", "Causa", "Correção"),
    "spec": ("Objetivo", "Fora de escopo"),
    "plano": ("Objetivo", "Fora de escopo"),
    "adr": ("Contexto", "Decisão", "Consequências"),
    "analise": ("Achados", "Recomendação"),
}
# Titulos que o vault ja usa e valem pela secao do padrao.
SINONIMOS = {
    "pendencias": ("em aberto", "proximos passos"),
    "verificacao": ("como foi verificado", "testes"),
    "causa": ("causa raiz", "hipotese"),
    "correcao": ("correcao aplicada", "solucao"),
    "objetivo": ("problema", "o que construir", "goal"),
    "achados": ("numeros", "resultado", "conclusao", "tl;dr"),
    "recomendacao": ("proximos passos", "conclusao"),
}
TETO_TITULO, TETO_RESUMO, TETO_TAGS = 80, 200, 3
PADRAO = ("A4", "A5", "A6", "A7", "A8", "A9")  # codigos do validar que o padrao usa


def secoes_faltando(tipo, corpo):
    """Secoes do padrao do tipo que o corpo nao tem; [] quando o tipo nao tem padrao."""
    pedidas = SECOES_PADRAO.get(tipo, ())
    if not pedidas:
        return []
    tem = [normalizar(t) for nivel, t, _, _ in secoes_de(corpo)[0]]
    if "anexos" in tem:  # nota dividida: as secoes vivem nos anexos
        return []

    def bate(chave):
        return any(chave in t or any(s in t for s in SINONIMOS.get(chave, ())) for t in tem)

    return [s for s in pedidas if not bate(normalizar(s))]


def avisos_padrao(tipo, titulo, resumo, tags, corpo, ticket=False):
    avisos = []
    if len(titulo) > TETO_TITULO:
        avisos.append(f"titulo com {len(titulo)} caracteres (padrao: ate {TETO_TITULO}); o nome "
                      "da nota aparece em hub, buscar e conexoes")
    if len(resumo) > TETO_RESUMO:
        avisos.append(f"resumo com {len(resumo)} caracteres (padrao: ate {TETO_RESUMO}, uma "
                      "frase); buscar e contexto_projeto cortam nesse tamanho")
    if len(tags) > TETO_TAGS:
        avisos.append(f"{len(tags)} tags (padrao: 1 a {TETO_TAGS})")
    if not ticket:
        faltam = secoes_faltando(tipo, corpo)
        if faltam:
            avisos.append("secoes do padrao ausentes: " + ", ".join(f"## {s}" for s in faltam))
    return avisos


def linkadas_abertas(texto, todas, idx):
    """Specs, planos e bugs ainda ativos ou rascunho que o texto linka: a evolucao
    que os fecha deve marca-los resolvido."""
    por_rel = {n["rel"]: n for n in todas}
    abertas = []
    for link in sorted(links_de(texto)):
        n = por_rel.get(idx["por_nome"].get(nome_alvo(link)))
        if (n and valores(n["fm"].get("tipo"))[0] in ("spec", "plano", "bug")
                and valores(n["fm"].get("status"))[0] in ("ativo", "rascunho")):
            abertas.append(n["nome"])
    return abertas


def salvar_nota(projeto="", tipo="", titulo="", corpo="", resumo="", status="ativo",
                tags=None, data=None, artefato=None, descricao_projeto=None, repo=None,
                sobrescrever=False, arquivos=None, lote=False):
    projeto, titulo = nome_seguro(projeto), nome_seguro(titulo)
    tipo, status = normalizar(tipo), normalizar(status or "ativo")
    resumo = " ".join(str(resumo or "").split())
    if not projeto or not titulo or not str(corpo).strip():
        raise ErroUso("projeto, titulo e corpo sao obrigatorios")
    if tipo not in TIPOS:
        raise ErroUso(f"tipo invalido: {tipo!r}. Use: " + ", ".join(sorted(TIPOS)))
    if status not in STATUS:
        raise ErroUso(f"status invalido: {status!r}. Use: " + ", ".join(sorted(STATUS)))
    data = str(data or hoje())
    if not DATA_RE.fullmatch(data):
        raise ErroUso("data deve ser YYYY-MM-DD")
    if tipo == "mapa":
        nome, pasta, secao, sobrescrever = f"Mapa do Codigo {projeto}", "", "Mapa", True
        resumo = resumo or "mapa curado do codigo (graphify)"
    else:
        if not resumo:
            raise ErroUso("resumo (1 linha; vira a entrada no hub) e obrigatorio")
        nome, pasta, secao = f"{data} {titulo}", PASTAS[tipo], PASTAS[tipo]
        if artefato:
            if pasta != "Specs":
                raise ErroUso("artefato (ticket) so vale para tipo spec ou plano")
            pasta = f"Specs/Tickets - {nome_de_nota(artefato)}"
    rel = "/".join(p for p in (projeto, pasta, nome + ".md") if p)
    caminho = os.path.join(VAULT, *rel.split("/"))
    if lote:
        abrir_lote()
    else:
        puxar()
    if os.path.exists(caminho) and not sobrescrever:
        raise ErroUso(f"ja existe: {rel}. Mudar o conteudo: atualizar_nota; "
                      "regravar do zero: sobrescrever=true.")
    todas = notas()
    hub_novo = garantir_hub(projeto, descricao_projeto, repo)
    aviso = None
    if arquivos:
        lista = arquivos.split(",") if isinstance(arquivos, str) else list(arquivos)
        try:
            componentes, aviso = componentes_tocados(projeto, lista, repo)
            corpo = str(corpo).rstrip("\n") + "\n\n" + componentes
        except ErroUso as e:
            aviso = f"Componentes: grafo indisponivel ({e})"
    texto = (bloco_frontmatter(projeto, tipo, status, data, tags) + "\n"
             + com_cabecalho(corpo, titulo, projeto) + "\n")
    escrever(caminho, texto)
    hub = os.path.join(VAULT, projeto, projeto + ".md")
    escrever(hub, inserir_na_secao(ler(hub), secao, f"- [[{nome}]] — {resumo}"))
    linhas = [f"Salva: {rel}",
              "Hub: " + ("criado e registrado no Home" if hub_novo else "entrada adicionada")
              + f" ({projeto}/{projeto}.md)"]
    if hub_novo:
        np = normalizar(projeto)
        parecidos = sorted({n["projeto"] for n in todas if n["fm"].get("tipo") == "hub"
                            and n["projeto"] and n["projeto"] != projeto
                            and (np in normalizar(n["projeto"]) or normalizar(n["projeto"]) in np)})
        if parecidos:
            linhas.append("Aviso: ja existiam hubs parecidos — confira se nao era um deles: "
                          + ", ".join(parecidos))
    atuais = notas()
    nomes = {n["nome"] for n in atuais}
    quebrados = sorted(l for l in links_de(texto) if l not in nomes)
    if quebrados:
        linhas.append("Wikilinks sem nota no vault (corrija ou crie a nota): "
                      + ", ".join(f"[[{l}]]" for l in quebrados))
    if aviso:
        linhas.append(aviso)
    if tipo != "mapa":
        linhas += ["Padrao: " + a for a in avisos_padrao(tipo, titulo, resumo, lista_tags(tags),
                                                         str(corpo), ticket=bool(artefato))]
        if tipo == "evolucao":
            abertas = linkadas_abertas(texto, atuais, indice(atuais))
            if abertas:
                linhas.append("Linkadas ainda ativas: " + ", ".join(f"[[{a}]]" for a in abertas)
                              + " — se a leva as concluiu, atualizar_nota status=resolvido")
    linhas.append("Git: " + (LOTE_PENDENTE if lote else
                             sincronizar(f"{projeto}: {nome if tipo == 'mapa' else titulo}")))
    return "\n".join(linhas)


def atualizar_nota(nota="", corpo=None, status=None, tags=None, sucessora=None, resumo=None,
                   lote=False):
    if corpo is None and status is None and tags is None and not sucessora and not resumo:
        raise ErroUso("informe ao menos um de: corpo, status, tags, sucessora, resumo")
    if lote:
        abrir_lote()
    else:
        puxar()
    todas = notas()
    alvo, erro = resolver(nota, todas)
    if erro:
        raise ErroUso(erro)  # na escrita, nota ausente E falha da chamada
    if alvo["fm"].get("tipo") == "hub":
        raise ErroUso("hub e indice mantido pelo servidor: grave notas (salvar_nota) ou "
                      "mude o resumo de uma nota (atualizar_nota resumo=...)")
    texto = alvo["texto"].replace("\r\n", "\n")
    fim = texto.find("\n---", 3) if texto.startswith("---") else -1
    if fim == -1:
        raise ErroUso(f"{alvo['rel']} nao tem frontmatter; regrave com salvar_nota "
                      "(sobrescrever=true)")
    cabeca, resto = texto[:fim + 4], texto[fim + 4:]
    projeto = alvo["projeto"] or alvo["fm"].get("projeto", "")
    mudou = []
    if corpo is not None:  # a cabeca termina em `---`: a linha em branco vem daqui
        resto = "\n\n" + com_cabecalho(corpo, PREFIXO_DATA_RE.sub("", alvo["nome"]), projeto) + "\n"
        mudou.append("corpo")
    if sucessora:
        alvo_suc, cands_suc = achar(sucessora, todas)   # mesma resolucao da nota-alvo
        if not alvo_suc and cands_suc:
            raise ErroUso(f'mais de uma nota bate com a sucessora "{sucessora}" — repita com o '
                          "caminho: " + "; ".join(n["rel"] for n in cands_suc[:5]))
        if not alvo_suc:
            raise ErroUso(f"sucessora nao existe no vault: {sucessora}. Crie-a antes (salvar_nota).")
        if alvo_suc["rel"] == alvo["rel"]:
            raise ErroUso(f"sucessora e a propria nota ({alvo['rel']}); passe a nota que a substitui")
        nome_suc = alvo_suc["nome"]
        # uma sucessora por vez: a linha anterior sai, a nova entra no topo do corpo
        resto = SUBSTITUIDA_RE.sub("", resto.lstrip("\n"), count=1)
        resto = f"\nSubstituída por [[{nome_suc}]].\n" + resto.lstrip("\n")
        status = status or "obsoleto"
        mudou.append(f"sucessora=[[{nome_suc}]]")
    if status is not None:
        status = normalizar(status)
        if status not in STATUS:
            raise ErroUso(f"status invalido: {status!r}. Use: " + ", ".join(sorted(STATUS)))
        cabeca = re.sub(r"(?m)^status:.*$", f"status: {status}", cabeca, count=1)
        mudou.append(f"status={status}")
    if tags is not None:
        linha = f"tags: [{', '.join(lista_tags(tags))}]"
        if re.search(r"(?m)^tags:", cabeca):
            cabeca = re.sub(r"(?m)^tags:.*$", linha, cabeca, count=1)
        else:
            cabeca = cabeca.replace("\n---", f"\n{linha}\n---", 1)
        mudou.append("tags")
    escrever(os.path.join(VAULT, *alvo["rel"].split("/")), cabeca + resto)
    if resumo:
        hub = os.path.join(VAULT, projeto, projeto + ".md")
        padrao = re.compile(r"(?m)^(- \[\[" + re.escape(alvo["nome"]) + r"(?:\|[^\]]*)?\]\]).*$")
        resumo = " ".join(str(resumo).split())
        novo, n = (padrao.subn(lambda m: f"{m.group(1)} — {resumo}", ler(hub))
                   if os.path.exists(hub) else ("", 0))
        if n:
            escrever(hub, novo)
            mudou.append("resumo no hub")
        else:
            mudou.append("resumo ignorado: a nota nao esta listada no hub")
    return (f"Atualizada: {alvo['rel']} ({', '.join(mudou)})\nGit: "
            + (LOTE_PENDENTE if lote else sincronizar(f"{projeto}: {alvo['nome']}")))


def sincronizar_lote(mensagem=""):
    """Fecha um lote: o que ESTE lote escreveu vira um commit so."""
    global _LOTE
    mensagem = " ".join(str(mensagem or "").split())
    if not mensagem:
        raise ErroUso("mensagem do commit e obrigatoria (ex.: 'pagamentos: migracao de 12 notas')")
    caminhos, _LOTE = sorted(set(_LOTE or [])), None
    if not vault_com_git():
        return "sem git (vault nao e repositorio, ou --sem-git): as notas ja estao em disco"
    if not caminhos:
        return "0 arquivo(s) no lote. Git: nada a commitar"
    saida = sincronizar(mensagem, caminhos)
    if "falhou" in saida:
        # Sem isto a migracao inteira fica so na maquina local e a unica pista e
        # uma frase no meio de uma linha de status.
        saida = "FALHOU, o vault NAO foi atualizado no remoto (as notas estao em disco): " + saida
    return f"{len(caminhos)} arquivo(s) no lote. Git: " + saida


# ---------- reorganizar: renomear e dividir ----------

def substituir_links(texto, antigo, novo):
    """[[antigo]], [[antigo|x]], [[antigo#y]] e [[Pasta/antigo]] viram novo, fora de
    blocos de codigo. (texto, quantos)."""
    padrao = re.compile(r"(\[\[(?:[^\]\[|#]*/)?)" + re.escape(antigo) + r"(?=[\]|#])")
    partes, total, pos = [], 0, 0
    for m in CODEBLOCK_RE.finditer(texto):
        trecho_, k = padrao.subn(lambda mm: mm.group(1) + novo, texto[pos:m.start()])
        partes += [trecho_, m.group(0)]
        total, pos = total + k, m.end()
    trecho_, k = padrao.subn(lambda mm: mm.group(1) + novo, texto[pos:])
    partes.append(trecho_)
    return "".join(partes), total + k


def alvo_de_escrita(nota, todas):
    """Nota comum resolvida para uma operacao de reorganizacao; hub, mapa e anexo ficam de fora."""
    alvo, erro = resolver(nota, todas)
    if erro:
        raise ErroUso(erro)
    if eh_hub(alvo) or valores(alvo["fm"].get("tipo"))[0] == "mapa":
        raise ErroUso("hub e mapa tem nome e lugar fixos pela convencao; so notas comuns")
    return alvo


def renomear_nota(nota="", novo_titulo="", lote=False):
    """Move o arquivo, troca o `# titulo` e reescreve os wikilinks do vault inteiro."""
    novo_titulo = nome_seguro(novo_titulo)
    if not novo_titulo:
        raise ErroUso("novo_titulo e obrigatorio")
    if lote:
        abrir_lote()
    else:
        puxar()
    todas = notas()
    alvo = alvo_de_escrita(nota, todas)
    m = PREFIXO_DATA_RE.match(alvo["nome"])
    novo_nome = (m.group(0) if m else "") + novo_titulo
    if novo_nome == alvo["nome"]:
        raise ErroUso("a nota ja se chama assim")
    if any(n["nome"] == novo_nome and n["projeto"] == alvo["projeto"] for n in todas):
        raise ErroUso(f"ja existe {novo_nome} no projeto {alvo['projeto']}")
    pasta = os.path.dirname(alvo["rel"])
    novo_rel = f"{pasta}/{novo_nome}.md" if pasta else f"{novo_nome}.md"
    texto = alvo["texto"]
    mh = re.search(r"(?m)^# (.*)$", texto)  # so o titulo muda; outro H1 fica
    if mh and normalizar(mh.group(1).strip()) == normalizar(PREFIXO_DATA_RE.sub("", alvo["nome"])):
        texto = texto[:mh.start(1)] + novo_titulo + texto[mh.end(1):]
    antigo = os.path.join(VAULT, *alvo["rel"].split("/"))
    escrever(os.path.join(VAULT, *novo_rel.split("/")), texto)
    os.remove(antigo)
    if _LOTE is not None:
        _LOTE.append(antigo)
    tocadas = 0
    for n in todas:
        if n is alvo:
            continue
        novo_texto, k = substituir_links(n["texto"], alvo["nome"], novo_nome)
        if k:
            escrever(os.path.join(VAULT, *n["rel"].split("/")), novo_texto)
            tocadas += 1
    return (f"Renomeada: {alvo['rel']} -> {novo_rel}\nWikilinks reescritos em {tocadas} nota(s)\n"
            "Git: " + (LOTE_PENDENTE if lote else
                       sincronizar(f"{alvo['projeto']}: renomeia {alvo['nome']} -> {novo_nome}")))


def dividir_nota(nota="", lote=False):
    """Nota grande vira abertura + indice, e cada secao ## vira uma nota em
    `Anexos - <nome>/`, ao lado dela. Os anexos nao entram no hub: a nota-mae os lista."""
    if lote:
        abrir_lote()
    else:
        puxar()
    todas = notas()
    alvo = alvo_de_escrita(nota, todas)
    if alvo["fm"].get("parte_de"):
        raise ErroUso("anexo nao se divide de novo")
    texto = alvo["texto"]
    fim_fm = texto.find("\n---", 3) if texto.startswith("---") else -1
    if fim_fm == -1:
        raise ErroUso(f"{alvo['rel']} nao tem frontmatter")
    cabeca, corpo = texto[:fim_fm + 4], texto[fim_fm + 4:]
    secoes, linhas = secoes_de(corpo)
    n2 = [s for s in secoes if s[0] == 2]
    if any(normalizar(t) == "anexos" for _, t, _, _ in n2):
        raise ErroUso("ja dividida: tem a secao Anexos")
    if len(n2) < 2:
        raise ErroUso("precisa de ao menos duas secoes ## para dividir")
    coberto = {i for _, _, ini, fim in n2 for i in range(ini, fim)}
    if len(coberto) != len(linhas) - n2[0][2]:
        raise ErroUso("ha um `# ` no meio da nota: divida a mao")
    # Os anexos ficam ao lado da nota-mae, nao numa subpasta: no Windows o caminho
    # `Anexos - <nome>/<nome> - NN <secao>.md` passava dos 260 caracteres.
    pasta = os.path.dirname(alvo["rel"])
    cabeca_parte = cabeca[:-4] + f"\nparte_de: {alvo['nome']}\n---"
    partes = []
    for i, (_, titulo, ini, fim) in enumerate(n2, 1):
        rotulo = titulo if len(titulo) <= 40 else titulo[:40].rsplit(" ", 1)[0]
        nome_parte = nome_seguro(f"{alvo['nome']} - {i:02d} {rotulo}")
        conteudo = "\n".join(linhas[ini + 1:fim]).strip("\n")
        corpo_parte = (f"# {titulo}\n\nProjeto: [[{alvo['projeto']}]]. Parte {i} de {len(n2)} "
                       f"de [[{alvo['nome']}]].\n\n{conteudo}\n")
        rel_parte = f"{pasta}/{nome_parte}.md" if pasta else f"{nome_parte}.md"
        escrever(os.path.join(VAULT, *rel_parte.split("/")), cabeca_parte + "\n\n" + corpo_parte)
        partes.append((nome_parte, titulo))
    abertura = "\n".join(linhas[:n2[0][2]]).strip("\n")
    indice_ = "\n".join(f"- [[{p}]] — {t}" for p, t in partes)
    escrever(os.path.join(VAULT, *alvo["rel"].split("/")),
             f"{cabeca}\n\n{abertura}\n\n## Anexos\n\nDividida em {len(partes)} partes, ao lado "
             f"desta nota:\n\n{indice_}\n")
    return (f"Dividida: {alvo['rel']} em {len(partes)} anexo(s) ao lado dela\n"
            "Git: " + (LOTE_PENDENTE if lote else
                       sincronizar(f"{alvo['projeto']}: divide {alvo['nome']} em {len(partes)} anexos")))


# ---------- linter ----------

TIPOS_VALIDOS = TIPOS | {"hub"}
OBRIGATORIOS = ("projeto", "tipo", "status", "data")


def validar_vault(projeto=None, tipo=None):
    """(erros, avisos, totais) — o mesmo vocabulario e parser que a gravacao usa."""
    todas = notas()
    if projeto:
        p = normalizar(projeto)
        todas = [n for n in todas if n["projeto"] and normalizar(n["projeto"]) == p]
    erros, avisos = [], []
    por_nome, links_para, com_saida = {}, defaultdict(list), set()
    projetos = defaultdict(list)
    for n in todas:
        por_nome.setdefault(n["nome"], n["rel"])
        if n["projeto"]:
            projetos[n["projeto"]].append(n)
        fm = frontmatter(n["texto"])
        if fm is None:
            erros.append(("E1", n["rel"], "sem frontmatter"))
        else:
            for campo in OBRIGATORIOS:
                if campo not in fm:
                    erros.append(("E2", n["rel"], f"campo '{campo}' ausente"))
            for campo, validos in (("tipo", TIPOS_VALIDOS), ("status", STATUS)):
                v = fm.get(campo)
                if v and not all(x in validos for x in valores(v)):
                    erros.append(("E3", n["rel"], f"{campo} invalido: '{v}'"))
        if n["links"]:
            com_saida.add(n["nome"])
        for alvo in n["links"]:
            # [[Specs/2026-01-10 X]] e link valido: o alvo e o nome do arquivo
            links_para[nome_alvo(alvo)].append(n["rel"])
    if not projeto:  # com filtro de projeto, links para fora dele nao sao erro
        # .base e .canvas sao linkaveis no Obsidian sem serem notas. A varredura
        # so serve ao E4, entao fica aqui dentro: com filtro ela seria descartada.
        alvos_validos = set(por_nome)
        for raiz, dirs, arqs in os.walk(VAULT):
            dirs[:] = [d for d in dirs if d not in IGNORAR]
            for a in arqs:
                if os.path.splitext(a)[1].lower() in (".base", ".canvas"):
                    alvos_validos.add(a)
                    alvos_validos.add(os.path.splitext(a)[0])
        for alvo, origens in sorted(links_para.items()):
            if alvo not in alvos_validos:
                erros.append(("E4", origens[0], f"wikilink quebrado: [[{alvo}]]"))
    for proj, nomes in sorted(projetos.items()):
        hub = next((n for n in todas if n["rel"] == f"{proj}/{proj}.md"), None)
        if hub is None:
            avisos.append(("A3", proj + "/", "projeto sem hub"))
            continue
        citados = hub["links"]
        for n in nomes:  # anexo (parte_de:) e listado pela nota-mae, nao pelo hub
            if n["nome"] != proj and n["nome"] not in citados and not n["fm"].get("parte_de"):
                erros.append(("E5", n["rel"], "nao listada no hub"))
    for n in sorted(todas, key=lambda x: x["rel"]):
        if n["nome"] not in links_para and n["nome"] != "Home":
            avisos.append(("A1", n["rel"], "orfa: ninguem linka para ela"))
        if n["nome"] not in com_saida:
            avisos.append(("A2", n["rel"], "sem wikilink de saida"))
        avisos += avisos_padrao_da_nota(n)
    filtro = {"frontmatter": ("E1", "E2", "E3"), "links": ("E4", "A2"),
              "orfas": ("A1",), "hub": ("E5", "A3"),
              "padrao": PADRAO}.get(normalizar(tipo) if tipo else None)
    if filtro:
        erros = [e for e in erros if e[0] in filtro]
        avisos = [a for a in avisos if a[0] in filtro]
    return erros, avisos, {"notas": len(todas), "projetos": len(projetos)}


def avisos_padrao_da_nota(n):
    """A4-A9: o padrao de nota, medido sobre o que ja esta no vault."""
    saida = []
    if eh_hub(n):
        sem = longos = 0
        for m in filter(None, map(HUB_LINHA_RE.match, CODEBLOCK_RE.sub("", n["texto"]).split("\n"))):
            r = m.group(2).strip()
            if not r:
                sem += 1
            elif len(r) > TETO_RESUMO:
                longos += 1
        if sem:
            saida.append(("A4", n["rel"], f"{sem} entrada(s) sem resumo"))
        if longos:
            saida.append(("A9", n["rel"], f"{longos} resumo(s) acima de {TETO_RESUMO} caracteres"))
        return saida
    if not n["projeto"]:
        return saida
    if len(n["texto"]) > TETO_NOTA:
        saida.append(("A5", n["rel"], f"nota grande: {len(n['texto'])} caracteres (teto {TETO_NOTA}); "
                                      "ler_nota devolve o esboco"))
    if n["fm"].get("parte_de"):  # anexo herda tipo, tags e nome da mae: so o tamanho conta
        return saida
    t = valores(n["fm"].get("tipo"))[0]
    if "/Tickets - " not in n["rel"]:
        faltam = secoes_faltando(t, corpo_de(n))
        if faltam:
            saida.append(("A6", n["rel"], "sem as secoes do padrao: " + ", ".join(faltam)))
    n_tags = len(lista_tags(str(n["fm"].get("tags", "")).strip("[]")))
    if n_tags > TETO_TAGS:
        saida.append(("A7", n["rel"], f"{n_tags} tags (padrao: ate {TETO_TAGS})"))
    if len(n["nome"]) > TETO_TITULO + 11:  # 11 = data e espaco
        saida.append(("A8", n["rel"], f"nome com {len(n['nome'])} caracteres (padrao: ate "
                                      f"{TETO_TITULO} no titulo)"))
    return saida


def relatorio_validacao(erros, avisos, totais, max_avisos=40, so_placar=False, ocultar=()):
    """`ocultar`: codigos que entram so contados, no fim — o padrao de nota, que num
    vault antigo sao centenas de linhas, so e listado quando pedido."""
    ocultos = Counter(c for c, _, _ in avisos if c in ocultar)
    avisos = [a for a in avisos if a[0] not in ocultar]
    linhas = []
    if not so_placar:
        linhas += [f"ERRO  {c} {onde}: {msg}" for c, onde, msg in erros]
        linhas += [f"aviso {c} {onde}: {msg}" for c, onde, msg in avisos[:max_avisos]]
        if len(avisos) > max_avisos:
            linhas.append(f"aviso ... e mais {len(avisos) - max_avisos} avisos")
        linhas.append("" if linhas else "Nada a apontar.")
    contagem = Counter(c for c, _, _ in erros + avisos)
    linhas += [f"Notas: {totais['notas']} | Projetos: {totais['projetos']}",
               f"Erros: {len(erros)} | Avisos: {len(avisos)}"]
    linhas += [f"  {c}: {contagem[c]}" for c in sorted(contagem)]
    if ocultos:
        linhas.append("Padrao de nota (validar tipo=padrao lista): "
                      + ", ".join(f"{c}: {ocultos[c]}" for c in sorted(ocultos)))
    return "\n".join(linhas)


def validar(projeto=None, tipo=None):
    erros, avisos, totais = validar_vault(projeto, tipo)
    return relatorio_validacao(erros, avisos, totais, ocultar=() if tipo else PADRAO)


# ---------- graphify (grafo de codigo do repo, via ponteiro Repo: do hub) ----------

REPO_RE = re.compile(r"(?m)^Repo:\s*(.+?)\s*$")
CAMINHO_RE = re.compile(r"[A-Za-z]:[\\/][^\s`*|]+|/[^\s`*|]+|~[^\s`*|]*")


def caminho_da_linha(linha):
    """Hub escrito a mao traz coisas como `Repo: **`D:\\x`** no master (Windows)`:
    o caminho e so o primeiro trecho que parece caminho."""
    m = CAMINHO_RE.search(linha)
    return m.group(0).rstrip(".,;)") if m else linha.strip("`* ")
TETO_SAIDA = 8000


def registrar_repo(texto_hub, repo):
    """Poe `Repo: <caminho>` no fim do paragrafo de descricao do hub."""
    linhas = texto_hub.rstrip("\n").split("\n")
    pos = len(linhas)
    h1 = next((i for i, l in enumerate(linhas) if l.startswith("# ")), None)
    if h1 is not None:
        i = h1 + 1
        while i < len(linhas) and not linhas[i].strip():
            i += 1
        while i < len(linhas) and linhas[i].strip() and not linhas[i].startswith("#"):
            i += 1
        pos = i
    linhas.insert(pos, f"Repo: {repo}")
    return "\n".join(linhas) + "\n"


def repo_do_projeto(projeto, repo=None):
    """(caminho do repo, registrado_no_hub). Parametro > linha Repo: do hub > erro."""
    hub = os.path.join(VAULT, projeto, projeto + ".md")
    if not os.path.exists(hub):
        raise ErroUso(f'projeto "{projeto}" nao tem hub no vault (visao_geral lista os que existem)')
    texto = ler(hub)
    m = REPO_RE.search(texto)
    atual = caminho_da_linha(m.group(1)) if m else None
    registrado = False
    if repo:
        repo = os.path.abspath(os.path.expanduser(str(repo)))
        if not m:
            escrever(hub, registrar_repo(texto, repo))
            registrado = True
        elif os.path.normcase(atual) != os.path.normcase(repo):
            # o repositorio mudou de pasta: so o caminho muda, o resto da linha fica
            escrever(hub, texto.replace(m.group(0), m.group(0).replace(atual, repo, 1), 1))
            registrado = True
    elif m:
        repo = atual
    else:
        raise ErroUso(f"hub de {projeto} sem linha `Repo:`; passe repo=<caminho do repositorio>")
    if not os.path.isdir(repo):
        raise ErroUso(f"repo nao esta nesta maquina: {repo}")
    return repo, registrado


def grafo_do_projeto(projeto, repo=None):
    """(repo, registrado, grafo, pasta do graphify-out)."""
    repo, registrado = repo_do_projeto(projeto, repo)
    pasta = os.path.join(repo, "graphify-out")
    caminho = os.path.join(pasta, "graph.json")
    if not os.path.exists(caminho):
        raise ErroUso(f"sem grafo em {pasta}: rode /graphify-ai no repo "
                      "(graphify-out fica no repo, no .gitignore)")
    with open(caminho, encoding="utf-8") as f:
        return repo, registrado, json.load(f), pasta


def frescor(repo, g):
    commit = str(g.get("built_at_commit") or "")
    curto = commit[:7] or "?"
    if not shutil.which("git") or git_em(repo, "rev-parse", "--is-inside-work-tree")[0] != 0:
        return f"Commit do grafo: {curto} | sem git"
    head = git_em(repo, "rev-parse", "HEAD")[1][:7]
    if not commit:
        estado = "commit do grafo desconhecido"
    elif commit[:7] == head:
        estado = "atualizado"
    else:
        rc, n = git_em(repo, "rev-list", "--count", f"{commit}..HEAD")
        estado = f"atrasado {n} commit(s)" if rc == 0 else "atrasado (commit do grafo fora do historico)"
    return f"Commit do grafo: {curto} | HEAD: {head} | {estado}"


def rotulos_comunidades(pasta):
    p = os.path.join(pasta, ".graphify_labels.json")
    try:
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError):
        return {}
    if isinstance(d, dict) and isinstance(d.get("labels"), dict):
        d = d["labels"]
    return {str(k): str(v) for k, v in d.items()} if isinstance(d, dict) else {}


def analisar_grafo(g, pasta):
    """(nos por id, grau, [(rotulo, ids por grau desc)] por tamanho desc, god nodes, n arestas)."""
    nos = {n["id"]: n for n in g.get("nodes", []) if isinstance(n, dict) and "id" in n}
    arestas = g.get("links") or g.get("edges") or []
    grau = Counter()
    for e in arestas:
        grau[e.get("source")] += 1
        grau[e.get("target")] += 1
    rotulos = rotulos_comunidades(pasta)
    por_comunidade = defaultdict(list)
    for nid, n in nos.items():
        por_comunidade[str(n.get("community", "?"))].append(nid)
    comunidades = []
    for cid, ids in por_comunidade.items():
        ids.sort(key=lambda i: -grau[i])
        comunidades.append((rotulos.get(cid, f"comunidade {cid}"), ids))
    comunidades.sort(key=lambda c: -len(c[1]))
    god = sorted(nos, key=lambda i: -grau[i])[:10]
    return nos, grau, comunidades, god, len(arestas)


def secoes_do_report(pasta):
    """Secoes do GRAPH_REPORT.md sobre conexoes e perguntas, ate 30 linhas cada."""
    p = os.path.join(pasta, "GRAPH_REPORT.md")
    if not os.path.exists(p):
        return ""
    saida, pegar, n = [], False, 0
    for l in ler(p).split("\n"):
        if l.startswith("#"):
            t = normalizar(l)
            pegar = any(k in t for k in ("connection", "conex", "question", "pergunta"))
            n = 0
            if pegar:
                saida.append(l.lstrip("#").strip() + ":")
            continue
        if pegar and l.strip() and n < 30:
            saida.append(l)
            n += 1
    return "\n".join(saida)


def resumo_grafo(g, pasta, max_comunidades=20):
    """(linhas das maiores comunidades, linhas de god nodes, texto do report,
    n nos, n arestas, n comunidades). Projeto grande tem centenas de comunidades:
    listar todas estourava o teto da saida antes dos god nodes."""
    nos, grau, comunidades, god, n_arestas = analisar_grafo(g, pasta)

    def rot(i):
        return str(nos[i].get("label") or i)

    mostradas = comunidades if max_comunidades is None else comunidades[:max_comunidades]
    resto = [] if max_comunidades is None else comunidades[max_comunidades:]
    com = [f"- {nome} — {len(ids)} nós: " + ", ".join(rot(i) for i in ids[:3])
           for nome, ids in mostradas]
    if resto:
        com.append(f"- … e mais {len(resto)} comunidades menores "
                   f"({sum(len(ids) for _, ids in resto)} nós)")
    gods = [f"- {rot(i)} ({nos[i].get('source_file', '?')}) — grau {grau[i]}" for i in god]
    return com, gods, secoes_do_report(pasta), len(nos), n_arestas, len(comunidades)


def mapa_codigo(projeto="", repo=None):
    repo, registrado, g, pasta = grafo_do_projeto(projeto, repo)
    com, gods, rep, n_nos, n_arestas, n_com = resumo_grafo(g, pasta)
    linhas = [f"Grafo: {os.path.join(pasta, 'graph.json')} — {n_nos} nós, {n_arestas} arestas",
              frescor(repo, g), "God nodes (10 por grau):"] + gods + \
             [f"Comunidades ({n_com}, as maiores primeiro):"] + com
    if rep:
        linhas += ["Do GRAPH_REPORT.md:", rep]
    saida = "\n".join(linhas)
    if len(saida) > TETO_SAIDA:
        saida = saida[:TETO_SAIDA] + f"\n… (saída cortada em {TETO_SAIDA} caracteres)"
    if registrado:  # depois do corte: o aviso de que o hub mudou nunca some
        saida += "\nHub: linha Repo registrada. Git: " + sincronizar(f"{projeto}: Repo registrado no hub")
    return saida


def componentes_tocados(projeto, arquivos, repo=None):
    """('## Componentes tocados' pronta, linha-resumo) a partir do grafo do repo."""
    repo, _, g, pasta = grafo_do_projeto(projeto, repo)
    nos, grau, comunidades, _, _ = analisar_grafo(g, pasta)
    rotulo_de = {i: nome for nome, ids in comunidades for i in ids}
    raiz = repo.replace("\\", "/").rstrip("/") + "/"
    achados, sem_no, vistos = defaultdict(list), [], set()
    for arq in arquivos:
        a = str(arq).replace("\\", "/").strip()
        if a.startswith("./"):
            a = a[2:]
        if a.startswith(raiz):
            a = a[len(raiz):]
        ids = []
        for i, n in nos.items():
            sf = str(n.get("source_file") or "").replace("\\", "/")
            if sf and (sf == a or sf.endswith("/" + a) or a.endswith("/" + sf)):
                ids.append(i)
        if not ids:
            sem_no.append(a)
            continue
        # o mesmo arquivo pode vir duas vezes (a.py e ./a.py): cada no conta uma vez
        for i in sorted(ids, key=lambda i: -grau[i]):
            if i not in vistos:
                vistos.add(i)
                achados[rotulo_de.get(i, "?")].append(str(nos[i].get("label") or i))
    total = len(vistos)
    # a secao e relida em toda leitura da nota: 6 comunidades, 5 rotulos cada
    ordenadas = sorted(achados.items(), key=lambda kv: -len(kv[1]))
    linhas = ["## Componentes tocados", ""]
    for nome, labels in ordenadas[:6]:
        extra = f" (+{len(labels) - 5})" if len(labels) > 5 else ""
        linhas.append(f"- {nome}: " + ", ".join(labels[:5]) + extra + f" ({len(labels)} nós)")
    if len(ordenadas) > 6:
        linhas.append(f"- … e mais {len(ordenadas) - 6} comunidades "
                      f"({sum(len(l) for _, l in ordenadas[6:])} nós)")
    if sem_no:
        linhas.append("- sem nó no grafo: " + ", ".join(sem_no))
    if os.path.exists(os.path.join(VAULT, projeto, f"Mapa do Codigo {projeto}.md")):
        linhas.append(f"Mapa: [[Mapa do Codigo {projeto}]]")
    resumo = f"Componentes: {total} nós em {len(achados)} comunidades; {len(sem_no)} arquivo(s) sem nó"
    return "\n".join(linhas), resumo


LEITURA_RE = re.compile(r"(?ms)^## Leitura curada\s*\n(.*?)(?=^## |\Z)")


def gerar_mapa(projeto="", leitura=None, repo=None):
    repo, _, g, pasta = grafo_do_projeto(projeto, repo)
    nome = f"Mapa do Codigo {projeto}"
    existente = os.path.join(VAULT, projeto, nome + ".md")
    if leitura is None and os.path.exists(existente):
        m = LEITURA_RE.search(ler(existente))
        leitura = m.group(1) if m else None
    leitura = (leitura or "").strip() or "(ainda sem leitura curada — passe leitura em gerar_mapa)"
    com, gods, rep, _, _, n_com = resumo_grafo(g, pasta, max_comunidades=None)  # a nota e o indice: completa
    commit = str(g.get("built_at_commit") or "")[:7] or "?"
    corpo = [f"# {nome}", "",
             f"Projeto: [[{projeto}]]. Gerado do graphify-out em {hoje()} (commit {commit}).", "",
             "## Leitura curada", "", leitura, "", "## God nodes", ""] + gods + \
            ["", f"## Comunidades ({n_com})", ""] + com
    if rep:
        corpo += ["", "## Conexões e perguntas (GRAPH_REPORT)", "", rep]
    return salvar_nota(projeto=projeto, tipo="mapa", titulo=nome, corpo="\n".join(corpo), repo=repo)


def consultar_codigo(projeto="", pergunta=None, explicar=None, caminho=None, repo=None):
    if sum(1 for x in (pergunta, explicar, caminho) if x) != 1:
        raise ErroUso("informe exatamente um de: pergunta, explicar, caminho=[A, B]")
    exe = shutil.which("graphify")
    if not exe:
        raise ErroUso("graphify nao instalado: pip install graphifyy")
    repo, registrado, _, pasta = grafo_do_projeto(projeto, repo)
    grafo = os.path.join(pasta, "graph.json")
    if pergunta:
        cmd = [exe, "query", str(pergunta), "--graph", grafo, "--budget", "2000"]
    elif explicar:
        cmd = [exe, "explain", str(explicar), "--graph", grafo]
    else:
        if not isinstance(caminho, list) or len(caminho) != 2:
            raise ErroUso("caminho deve ser uma lista com dois rotulos: [A, B]")
        cmd = [exe, "path", str(caminho[0]), str(caminho[1]), "--graph", grafo]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=60, cwd=repo)
    except subprocess.TimeoutExpired:
        raise ErroUso("graphify demorou mais de 60 s")
    if r.returncode != 0:
        raise ErroUso(f"graphify falhou: {(r.stderr or r.stdout).strip()[-500:]}")
    saida = r.stdout.strip() or "(sem resultado)"
    if registrado:
        saida += "\nHub: linha Repo registrada. Git: " + sincronizar(f"{projeto}: Repo registrado no hub")
    return saida[:TETO_SAIDA]


# ---------- definicao das ferramentas ----------

def esquema(props, *obrigatorios):
    return {"type": "object", "properties": props,
            "required": list(obrigatorios), "additionalProperties": False}


P_PROJETO = {"type": "string",
             "description": "Filtra por projeto (nome da pasta no vault)."}
P_TIPO = {"type": "string",
          "description": "Filtra por tipo: spec, plano, bug, evolucao, "
                         "arquitetura, adr, analise, mapa ou hub."}
P_STATUS = {"type": "string",
            "description": "Filtra por status: ativo, rascunho, resolvido "
                           "ou obsoleto."}
P_NOTA = {"type": "string",
          "description": "Caminho relativo ao vault (projeto/Specs/2026-01-02 "
                         "X.md) ou nome da nota como em wikilink (2026-01-02 X); trecho "
                         "do nome, sem acento nem maiuscula, tambem serve."}

P_PROJ = {"type": "string", "description": "Nome do projeto (pasta no vault)."}
P_LOTE = {"type": "boolean",
          "description": "true = parte de um lote: grava so em disco, sem pull/commit/push; "
                         "feche o lote com sincronizar. Padrao false."}
P_REPO = {"type": "string",
          "description": "Caminho local do repositorio; so se o hub nao tiver a linha "
                         "`Repo:` (fica registrado nele)."}

FERRAMENTAS = [
    {"name": "visao_geral",
     "description": "Panorama do vault: projetos, contagem de notas por tipo e notas "
                    "recentes. Para entrar num projeto, contexto_projeto.",
     "inputSchema": esquema({}),
     "fn": visao_geral},
    {"name": "contexto_projeto",
     "description": "Arranque num projeto, com teto fixo: descricao e Repo do hub, "
                    "contagem por tipo e status, a ultima evolucao (abertura e pendencias) "
                    "e as notas mais recentes de cada secao do hub com o resumo. Use no "
                    "lugar de ler o hub inteiro; depois ler_nota so na nota que interessar.",
     "inputSchema": esquema({
         "projeto": P_PROJ,
         "por_secao": {"type": "integer",
                       "description": "Notas por secao do hub (padrao 3, teto 10)."},
     }, "projeto"),
     "fn": contexto_projeto},
    {"name": "buscar",
     "description": "Busca full-text nas notas, ignorando acentos e maiusculas; varios "
                    "termos = todos precisam aparecer. Cada resultado traz caminho, "
                    "metadados e o resumo da nota no hub (ou um trecho, se nao esta no hub).",
     "inputSchema": esquema({
         "consulta": {"type": "string",
                      "description": "Termos de busca (obrigatorio)."},
         "projeto": P_PROJETO, "tipo": P_TIPO, "status": P_STATUS,
         "limite": {"type": "integer",
                    "description": "Maximo de resultados (padrao 10, teto 30)."},
     }, "consulta"),
     "fn": buscar},
    {"name": "listar_notas",
     "description": "Lista notas (caminho + frontmatter, sem conteudo), mais "
                    "recentes primeiro. Filtros opcionais projeto/tipo/status.",
     "inputSchema": esquema({
         "projeto": P_PROJETO, "tipo": P_TIPO, "status": P_STATUS,
         "limite": {"type": "integer",
                    "description": "Maximo de notas (padrao 20, teto 100)."},
     }),
     "fn": listar_notas},
    {"name": "ler_nota",
     "description": "Le uma nota: integral, so uma secao (secao=) ou cortada (max_chars=). "
                    "Secao inexistente devolve a lista de secoes. Nota acima de "
                    f"{TETO_NOTA} caracteres devolve o esboco (abertura e secoes com "
                    "tamanho) em vez do texto; integral=true le mesmo assim.",
     "inputSchema": esquema({
         "nota": P_NOTA,
         "secao": {"type": "string",
                   "description": "Titulo de um cabecalho da nota (sem #; acento e caixa "
                                  "nao importam; prefixo serve)."},
         "max_chars": {"type": "integer",
                       "description": "Corta o texto neste tamanho (minimo 200)."},
         "integral": {"type": "boolean",
                      "description": "true = nota grande vem inteira (padrao false)."},
     }, "nota"),
     "fn": ler_nota},
    {"name": "conexoes",
     "description": "Notas relacionadas a uma nota, com o resumo de cada uma: wikilinks "
                    "de saida e backlinks, fora os que a convencao gera sozinha (hub e "
                    "Home). Um salto de expansao a partir do que buscar achou.",
     "inputSchema": esquema({"nota": P_NOTA}, "nota"),
     "fn": conexoes},
    {"name": "salvar_nota",
     "description": "Cria uma nota nova com tudo que a convencao exige: pasta por tipo, nome "
                    "`YYYY-MM-DD titulo`, frontmatter, `# titulo` e link do hub no corpo, "
                    "entrada no hub (hub e Home criados se o projeto for novo), commit+push. "
                    "Ticket: passe `artefato`. tipo=mapa regrava `Mapa do Codigo <projeto>`. "
                    "Nota que ja existe: atualizar_nota.",
     "inputSchema": esquema({
         "projeto": {"type": "string",
                     "description": "Pasta do repo git (minusculo, sem acento). Hub "
                                    "existente sempre ganha."},
         "tipo": {"type": "string",
                  "description": "spec | plano | bug | evolucao | arquitetura | adr | "
                                 "analise | mapa"},
         "titulo": {"type": "string", "description": "Curto; vira o nome do arquivo."},
         "corpo": {"type": "string",
                   "description": "Markdown. `# titulo` e `Projeto: [[projeto]]` entram se "
                                  "faltarem. Linke relacionadas por [[nome da nota]]."},
         "resumo": {"type": "string",
                    "description": "1 linha: a entrada no hub (obrigatorio, exceto mapa)."},
         "status": {"type": "string",
                    "description": "rascunho | ativo (padrao) | resolvido | obsoleto"},
         "tags": {"type": "array", "items": {"type": "string"},
                  "description": "1-3, kebab-case sem acento (opcional)."},
         "data": {"type": "string",
                  "description": "YYYY-MM-DD (padrao: hoje; migracao: data do 1o commit)."},
         "artefato": {"type": "string",
                      "description": "Nota (sem .md) que originou este ticket: grava em "
                                     "Specs/Tickets - <artefato>/."},
         "descricao_projeto": {"type": "string",
                               "description": "So projeto NOVO: 1 linha para o hub e o Home."},
         "repo": {"type": "string",
                  "description": "Caminho local do repositorio (hub novo, e ponteiro do "
                                 "graphify; registrado no hub se faltar)."},
         "sobrescrever": {"type": "boolean",
                          "description": "Regrava se ja existir (padrao false)."},
         "arquivos": {"type": "array", "items": {"type": "string"},
                      "description": "Caminhos tocados pela leva, relativos ao repo: o servidor "
                                     "anexa Componentes tocados a partir do grafo (evolucao, "
                                     "bug, spec de mudanca)."},
         "lote": P_LOTE,
     }, "projeto", "tipo", "titulo", "corpo"),
     "fn": salvar_nota},
    {"name": "atualizar_nota",
     "description": "Altera uma nota existente, in-place: `corpo` (texto apos o frontmatter), "
                    "`status`, `tags`, `sucessora` (marca obsoleta e linka a substituta) e "
                    "`resumo` (linha no hub). Commit+push.",
     "inputSchema": esquema({
         "nota": P_NOTA,
         "corpo": {"type": "string", "description": "Novo corpo completo em markdown."},
         "status": {"type": "string",
                    "description": "rascunho | ativo | resolvido | obsoleto"},
         "tags": {"type": "array", "items": {"type": "string"},
                  "description": "Substitui a lista inteira; [] limpa."},
         "sucessora": {"type": "string",
                       "description": "Nome da nota que substitui esta (sem .md)."},
         "resumo": {"type": "string", "description": "Nova linha de resumo no hub."},
         "lote": P_LOTE,
     }, "nota"),
     "fn": atualizar_nota},
    {"name": "renomear_nota",
     "description": "Renomeia uma nota comum: move o arquivo (a data do nome fica), troca o "
                    "`# titulo` e reescreve os wikilinks do vault inteiro, hubs inclusive. Hub "
                    "e mapa nao se renomeiam. Commit+push.",
     "inputSchema": esquema({
         "nota": P_NOTA,
         "novo_titulo": {"type": "string", "description": "Titulo novo, sem a data."},
         "lote": P_LOTE,
     }, "nota", "novo_titulo"),
     "fn": renomear_nota},
    {"name": "dividir_nota",
     "description": "Nota grande vira abertura + indice, e cada secao ## vira uma nota ao lado "
                    "dela, `<nome> - NN <secao>`, com o mesmo frontmatter mais `parte_de:`. Os "
                    "anexos nao entram no hub (a nota-mae os lista) e o validar nao os cobra la. "
                    "Commit+push.",
     "inputSchema": esquema({"nota": P_NOTA, "lote": P_LOTE}, "nota"),
     "fn": dividir_nota},
    {"name": "sincronizar",
     "description": "Fecha um lote (gravacoes com lote=true): commit unico -> pull --rebase "
                    "-> push. Obrigatorio ao fim de migracao ou serie de tickets; sem isso "
                    "as notas ficam so no disco local.",
     "inputSchema": esquema({
         "mensagem": {"type": "string",
                      "description": "Mensagem do commit (ex.: 'pagamentos: migracao de 12 notas')."},
     }, "mensagem"),
     "fn": sincronizar_lote},
    {"name": "validar",
     "description": "Linter do vault: sem frontmatter (E1), campo ausente (E2), tipo/status "
                    "fora do vocabulario (E3), wikilink quebrado (E4), nota fora do hub (E5); "
                    "avisos: orfa (A1), sem link de saida (A2), projeto sem hub (A3). O padrao "
                    "de nota (A4 hub sem resumo, A5 nota grande, A6 secoes ausentes, A7 tags, "
                    "A8 nome longo, A9 resumo longo) entra so contado; tipo=padrao lista. Rode "
                    "ao fechar uma leva.",
     "inputSchema": esquema({
         "projeto": P_PROJETO,
         "tipo": {"type": "string",
                  "description": "So uma checagem: frontmatter | links | orfas | hub | padrao."},
     }),
     "fn": validar},
    {"name": "mapa_codigo",
     "description": "Mapa do codigo a partir do graphify-out do repo (ponteiro Repo: do hub): "
                    "frescor do grafo, god nodes, as 20 maiores comunidades e destaques do "
                    "GRAPH_REPORT. Leia antes de mexer no codigo.",
     "inputSchema": esquema({"projeto": P_PROJ, "repo": P_REPO}, "projeto"),
     "fn": mapa_codigo},
    {"name": "consultar_codigo",
     "description": "Pergunta de arquitetura ao grafo do graphify (CLI local): `pergunta` "
                    "livre, `explicar` um no, ou `caminho` entre dois nos. Exatamente um.",
     "inputSchema": esquema({
         "projeto": P_PROJ,
         "pergunta": {"type": "string", "description": "Pergunta livre (BFS no grafo)."},
         "explicar": {"type": "string", "description": "Rotulo do no a explicar."},
         "caminho": {"type": "array", "items": {"type": "string"}, "minItems": 2, "maxItems": 2,
                     "description": "Dois rotulos: caminho mais curto de A a B."},
         "repo": P_REPO,
     }, "projeto"),
     "fn": consultar_codigo},
    {"name": "gerar_mapa",
     "description": "Regrava a nota `Mapa do Codigo <projeto>` a partir do graphify-out (god "
                    "nodes, comunidades, GRAPH_REPORT) preservando a secao Leitura curada; "
                    "passe `leitura` para atualiza-la. Apos cada rodada do graphify.",
     "inputSchema": esquema({
         "projeto": P_PROJ,
         "leitura": {"type": "string", "description": "Sua leitura curada (dominios, o que "
                                                      "vale saber, lacunas)."},
         "repo": P_REPO,
     }, "projeto"),
     "fn": gerar_mapa},
]
MAPA = {f["name"]: f for f in FERRAMENTAS}


# ---------- instalacao ----------

def instalar(vault_explicito):
    """Registra este servidor no Claude Code (`claude mcp add`, escopo user)."""
    if VAULT is None:
        return ("vault nao encontrado: defina OBSIDIAN_VAULT ou passe "
                "--instalar --vault <pasta de projetos do vault>")
    claude = shutil.which("claude")
    if not claude:
        return "`claude` nao esta no PATH: instale o Claude Code antes"
    servidor = [sys.executable, os.path.abspath(__file__)]
    if vault_explicito:
        servidor += ["--vault", VAULT]
    if SEM_GIT:
        servidor.append("--sem-git")
    # apaga registro anterior para o comando poder ser repetido
    subprocess.run([claude, "mcp", "remove", "-s", "user", "vault-docs"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    r = subprocess.run([claude, "mcp", "add", "-s", "user", "vault-docs", "--"]
                       + servidor)
    if r.returncode != 0:
        return r.returncode
    print("vault-docs registrado (escopo user). Reinicie o Claude Code e "
          "confira com `claude mcp list`.")
    return 0


# ---------- protocolo (JSON-RPC 2.0 sobre stdio) ----------

def responder(id_, resultado=None, erro=None):
    msg = {"jsonrpc": "2.0", "id": id_}
    if erro is not None:
        msg["error"] = erro
    else:
        msg["result"] = resultado
    sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def chamar_ferramenta(id_, params):
    nome = params.get("name")
    fer = MAPA.get(nome)
    if fer is None:
        responder(id_, erro={"code": -32602,
                             "message": f"ferramenta desconhecida: {nome}"})
        return
    if VAULT is None:
        texto, falhou = ERRO_VAULT, True
    else:
        try:
            texto, falhou = fer["fn"](**(params.get("arguments") or {})), False
        except ErroUso as e:
            texto, falhou = str(e), True
        except TypeError as e:
            texto, falhou = f"argumentos invalidos: {e}", True
        except Exception as e:  # nunca derrubar o servidor por uma chamada
            texto, falhou = f"erro ao executar {nome}: {e}", True
    responder(id_, {"content": [{"type": "text", "text": texto}],
                    "isError": falhou})


def atender(msg):
    metodo, id_, params = msg.get("method"), msg.get("id"), msg.get("params") or {}
    if metodo == "initialize":
        versao = params.get("protocolVersion")
        responder(id_, {
            "protocolVersion": versao if versao in PROTOCOLOS else PROTOCOLO_PADRAO,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "obsidian-docs", "version": "2.3.0"},
            "instructions": INSTRUCOES,
        })
        if VAULT is not None:  # le e normaliza o vault antes da primeira ferramenta
            threading.Thread(target=notas, daemon=True).start()
    elif metodo == "ping":
        responder(id_, {})
    elif metodo == "tools/list":
        responder(id_, {"tools": [
            {k: f[k] for k in ("name", "description", "inputSchema")}
            for f in FERRAMENTAS]})
    elif metodo == "tools/call":
        chamar_ferramenta(id_, params)
    elif id_ is None:
        pass  # notificacoes (initialized, cancelled, ...) nao tem resposta
    else:
        responder(id_, erro={"code": -32601,
                             "message": f"metodo desconhecido: {metodo}"})


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--vault", default=None,
                    help="pasta de projetos do vault (senao usa OBSIDIAN_VAULT)")
    ap.add_argument("--instalar", action="store_true",
                    help="registra este servidor no Claude Code (escopo user) e sai")
    ap.add_argument("--sem-git", action="store_true",
                    help="nunca commitar/empurrar o vault, mesmo sendo repositorio git")
    args = ap.parse_args()

    global VAULT, SEM_GIT
    SEM_GIT = args.sem_git
    caminho = args.vault or os.environ.get("OBSIDIAN_VAULT")
    if caminho:
        caminho = os.path.abspath(os.path.expanduser(caminho))
    if caminho and os.path.isdir(caminho):
        VAULT = caminho
    else:
        origem = caminho or "OBSIDIAN_VAULT nao definido"
        print(f"servidor_vault: vault indisponivel ({origem}); "
              "ferramentas vao instruir a configuracao", file=sys.stderr)

    if args.instalar:
        sys.exit(instalar(bool(args.vault)))

    # stdout transporta o protocolo: UTF-8 e \n mesmo no Windows
    for fluxo in (sys.stdin, sys.stdout):
        if hasattr(fluxo, "reconfigure"):
            fluxo.reconfigure(encoding="utf-8", newline="\n")

    for linha in sys.stdin:
        linha = linha.strip()
        if not linha:
            continue
        try:
            msg = json.loads(linha)
        except ValueError:
            responder(None, erro={"code": -32700, "message": "JSON invalido"})
            continue
        try:
            atender(msg)
        except Exception as e:  # erro interno nao pode matar o processo
            responder(msg.get("id"), erro={"code": -32603, "message": str(e)})


if __name__ == "__main__":
    main()
