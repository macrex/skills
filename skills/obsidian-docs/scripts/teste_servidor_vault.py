#!/usr/bin/env python3
"""Autoteste do servidor do vault, num vault temporario — nunca toca no seu.

  python scripts/teste_servidor_vault.py

Cobre o que a convencao promete: hub e Home nascem com o projeto, projeto novo
sem descricao e recusado, a nota vai para a pasta do tipo com nome datado e
frontmatter, ticket cai em `Specs/Tickets - <artefato>/`, o hub lista a nota,
atualizar_nota muda status/resumo/sucessora in-place, busca ignora acento, e o
vault que e repositorio git recebe um commit por gravacao. O protocolo
JSON-RPC e exercitado por `atender` (initialize, tools/list, tools/call).
"""
import contextlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import servidor_vault as sv  # noqa: E402

FALHAS = []


def confere(cond, msg):
    (print if cond else FALHAS.append)(("ok: " if cond else "") + msg)


def le(rel):
    with open(os.path.join(sv.VAULT, *rel.split("/")), encoding="utf-8") as f:
        return f.read()


def existe(rel):
    return os.path.exists(os.path.join(sv.VAULT, *rel.split("/")))


def chamada(nome, **args):
    """tools/call pelo protocolo, devolvendo (texto, isError)."""
    saida = io.StringIO()
    with contextlib.redirect_stdout(saida):
        sv.atender({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                    "params": {"name": nome, "arguments": args}})
    msg = json.loads(saida.getvalue())
    if "error" in msg:
        return msg["error"]["message"], "erro-jsonrpc"
    r = msg["result"]
    return r["content"][0]["text"], r["isError"]


def testes():
    # --- projeto novo: exige descricao; com ela nasce hub, Home e a nota ---
    try:
        sv.salvar_nota("pagamentos", "spec", "Cobranca recorrente", "corpo", resumo="r")
        confere(False, "projeto novo sem descricao_projeto deveria ser recusado")
    except sv.ErroUso as e:
        confere("nao existe no vault" in str(e), "projeto novo sem descricao e recusado")

    saida = sv.salvar_nota("pagamentos", "spec", "Cobrança recorrente", "Texto da spec.",
                           resumo="spec da cobranca", descricao_projeto="Modulo de pagamentos",
                           repo="/tmp/pagamentos", data="2026-01-10", tags=["cobranca"])
    confere("Salva: pagamentos/Specs/2026-01-10 Cobrança recorrente.md" in saida, "nota vai para Specs/ com data e titulo")
    confere("Hub: criado e registrado no Home" in saida, "hub criado na primeira nota")
    nota = le("pagamentos/Specs/2026-01-10 Cobrança recorrente.md")
    confere(nota.startswith("---\nprojeto: pagamentos\ntipo: spec\nstatus: ativo\ndata: 2026-01-10\ntags: [cobranca]\n---\n"),
            "frontmatter completo")
    confere("# Cobrança recorrente" in nota and "Projeto: [[pagamentos]]" in nota, "titulo e link do hub no corpo")
    hub = le("pagamentos/pagamentos.md")
    confere("Repo: /tmp/pagamentos" in hub, "hub guarda a linha Repo:")
    confere("- [[2026-01-10 Cobrança recorrente]] — spec da cobranca" in hub, "hub lista a nota com o resumo")
    confere("- [[pagamentos]] — Modulo de pagamentos" in le("Home.md"), "Home lista o projeto")

    # --- nota repetida e recusada; sobrescrever regrava ---
    try:
        sv.salvar_nota("pagamentos", "spec", "Cobrança recorrente", "outro", resumo="r", data="2026-01-10")
        confere(False, "nota repetida deveria ser recusada")
    except sv.ErroUso as e:
        confere("ja existe" in str(e), "nota repetida e recusada")
    sv.salvar_nota("pagamentos", "spec", "Cobrança recorrente", "Regravada.", resumo="r",
                   data="2026-01-10", sobrescrever=True)
    confere("Regravada." in le("pagamentos/Specs/2026-01-10 Cobrança recorrente.md"), "sobrescrever regrava")
    confere(le("pagamentos/pagamentos.md").count("[[2026-01-10 Cobrança recorrente]]") == 1,
            "hub nao duplica a entrada ao regravar")

    # --- tipos, validacao, ticket ---
    for tipo, pasta in (("bug", "Bugs"), ("evolucao", "Evolucoes"), ("adr", "Arquitetura"), ("analise", "Analises")):
        sv.salvar_nota("pagamentos", tipo, f"Nota {tipo}", "c", resumo="r", data="2026-02-01")
        confere(existe(f"pagamentos/{pasta}/2026-02-01 Nota {tipo}.md"), f"tipo {tipo} vai para {pasta}/")
    for args, erro in ((dict(tipo="nota"), "tipo invalido"), (dict(status="feito"), "status invalido"),
                       (dict(data="10/01/2026"), "data deve ser"), (dict(resumo=""), "resumo")):
        base = dict(projeto="pagamentos", tipo="spec", titulo="X", corpo="c", resumo="r")
        base.update(args)
        try:
            sv.salvar_nota(**base)
            confere(False, f"deveria recusar {args}")
        except sv.ErroUso as e:
            confere(erro in str(e), f"recusa {args}")
    saida = sv.salvar_nota("pagamentos", "plano", "T1 Criar tabela", "c", resumo="r",
                           artefato="2026-01-10 Cobrança recorrente", data="2026-02-02")
    confere("pagamentos/Specs/Tickets - 2026-01-10 Cobrança recorrente/2026-02-02 T1 Criar tabela.md" in saida,
            "ticket cai em Specs/Tickets - <artefato>/")
    try:
        sv.salvar_nota("pagamentos", "bug", "B", "c", resumo="r", artefato="x")
        confere(False, "artefato fora de spec/plano deveria ser recusado")
    except sv.ErroUso as e:
        confere("so vale para tipo spec ou plano" in str(e), "artefato so em spec/plano")

    # --- caractere que quebra wikilink no Obsidian nao entra no nome ---
    saida = sv.salvar_nota("pagamentos", "analise", "O PR #1 [x] ^y `z`", "c", resumo="r", data="2026-02-04")
    confere("pagamentos/Analises/2026-02-04 O PR 1 x y z.md" in saida, "titulo com # [ ] ^ e crase vira nome linkavel")

    # --- wikilink quebrado e avisado; hub parecido e avisado ---
    saida = sv.salvar_nota("pagamentos", "analise", "Com link", "Veja [[Nao existe]].", resumo="r", data="2026-02-03")
    confere("[[Nao existe]]" in saida and "Wikilinks sem nota" in saida, "wikilink quebrado e avisado")
    saida = sv.salvar_nota("pagamentos-repo", "spec", "S", "c", resumo="r", descricao_projeto="duplicado?")
    confere("hubs parecidos" in saida and "pagamentos" in saida, "hub parecido e avisado")

    # --- leitura e busca ---
    confere("Texto" not in sv.ler_nota("2026-01-10 Cobrança recorrente") and "Regravada." in sv.ler_nota("Cobrança recorrente"),
            "ler_nota resolve por nome e por trecho")
    busca = sv.buscar("cobranca")
    confere("pagamentos/Specs/2026-01-10 Cobrança recorrente.md" in busca, "busca ignora acento")
    confere("\n  spec da cobranca" in busca, "busca mostra o resumo do hub no lugar do trecho")
    confere("Nenhuma nota" in sv.buscar("zzz"), "busca sem resultado diz isso")
    lista = sv.listar_notas(projeto="pagamentos", tipo="evolucao")
    confere("1 de 1 nota(s)" in lista and "Nota evolucao" in lista, "listar_notas filtra por projeto e tipo")
    con = sv.conexoes("2026-02-03 Com link")
    confere("[[Nao existe]] (sem arquivo no vault)" in con and "Hub: [[pagamentos]] (lista esta nota)" in con
            and "Backlinks: nenhum alem de hub/Home" in con,
            "conexoes: hub vira uma linha, link quebrado aparece, backlink do hub nao conta")
    sv.salvar_nota("pagamentos", "analise", "Vizinha", "Deriva de [[2026-02-03 Com link]].",
                   resumo="analise vizinha", data="2026-02-05")
    con = sv.conexoes("2026-02-03 Com link")
    confere("Backlinks (1):" in con and "- pagamentos/Analises/2026-02-05 Vizinha.md — analise vizinha" in con,
            "conexoes: backlink novo aparece com o resumo (indice refeito apos a gravacao)")
    con = sv.conexoes("2026-02-05 Vizinha")
    confere("Relacionadas de saida (1):" in con and "- pagamentos/Analises/2026-02-03 Com link.md — r" in con,
            "conexoes: saida relacionada com resumo, hub fora da lista")
    con = sv.conexoes("pagamentos")
    confere(con.startswith("Nota: pagamentos/pagamentos.md\nHub de pagamentos:") and "Relacionadas de saida: nenhuma" in con,
            "conexoes num hub: as notas do projeto viram contagem")
    confere("Nota nao encontrada" in sv.conexoes("nada disso") and "Mais de uma nota" in sv.ler_nota("Nota"),
            "leituras devolvem orientacao como resultado, nao como erro")
    confere("pagamentos —" in sv.visao_geral() and "SEM HUB" not in sv.visao_geral(), "visao_geral lista o projeto com hub")

    # --- ler_nota: secao, max_chars, nota grande ---
    sv.salvar_nota("pagamentos", "evolucao", "Leva grande",
                   "Entregou a cobranca.\n\n## O que mudou\n\nTabela nova.\n\n## Verificação\n\nTestes.\n\n"
                   "## Pendências\n\n- migrar clientes\n- avisar suporte\n", resumo="leva da cobranca", data="2026-02-06")
    s = sv.ler_nota("2026-02-06 Leva grande", secao="pendencias")
    confere(s.startswith("Caminho: pagamentos/Evolucoes/2026-02-06 Leva grande.md\nSecao: ## Pendências")
            and "- migrar clientes" in s and "Tabela nova" not in s, "ler_nota secao= devolve so a secao, sem acento nem caixa")
    s = sv.ler_nota("2026-02-06 Leva grande", secao="nada")
    confere("nao existe" in s and "## O que mudou" in s and "## Pendências" in s, "secao inexistente lista as secoes")
    s = sv.ler_nota("2026-02-06 Leva grande", max_chars=250)
    confere("cortado em" in s and len(s) < 420, "max_chars corta no fim de linha e avisa")
    grande = "x" * 200 + "\n"
    sv.salvar_nota("pagamentos", "spec", "Enorme", "Abertura da enorme.\n\n## A\n\n" + grande * 120 + "\n## B\n\n" + grande * 100,
                   resumo="spec enorme", data="2026-02-07")
    s = sv.ler_nota("2026-02-07 Enorme")
    confere("Nota grande" in s and "- ## A (" in s and "- ## B (" in s and "Abertura da enorme." in s and len(s) < 1000,
            "nota acima do teto devolve o esboco: abertura, secoes e tamanhos")
    confere(len(sv.ler_nota("2026-02-07 Enorme", integral=True)) > 40000, "integral=true le a nota inteira")
    s = sv.ler_nota("2026-02-07 Enorme", secao="B")
    confere("Secao: ## B" in s and "xxxx" in s and len(s) < 22000, "secao= numa nota grande le so a secao")

    # --- contexto_projeto ---
    c = sv.contexto_projeto("pagamentos")
    confere(c.startswith("Projeto: pagamentos (pagamentos/pagamentos.md)\nModulo de pagamentos.") and "Repo: /tmp/pagamentos" in c,
            "contexto_projeto abre com a descricao e o Repo do hub")
    confere("Ultima evolucao: [[2026-02-06 Leva grande]] (2026-02-06, ativo) — leva da cobranca" in c
            and "  Entregou a cobranca." in c and "  Pendências:" in c and "  - migrar clientes" in c,
            "contexto_projeto traz a ultima evolucao com abertura e pendencias")
    confere("\nSpecs (" in c and "[[2026-02-07 Enorme]] — spec enorme" in c and "\nBugs (" in c,
            "contexto_projeto lista as secoes do hub com o resumo")
    confere(len(c) <= sv.TETO_CONTEXTO + 200, "contexto_projeto respeita o teto")
    c2 = sv.contexto_projeto("PAGAMENTOS", por_secao=1)
    confere("\nSpecs (" in c2 and c2.count("\n- [[") < c.count("\n- [["), "por_secao limita, e o nome do projeto ignora caixa")
    try:
        sv.contexto_projeto("pagamento")
        confere(False, "projeto sem hub deveria ser recusado")
    except sv.ErroUso as e:
        confere("nao tem hub" in str(e) and "pagamentos" in str(e), "projeto sem hub e recusado, com os parecidos")

    # --- padrao de nota: avisa ao salvar, nunca recusa ---
    saida = sv.salvar_nota("pagamentos", "evolucao", "Fecha a cobranca " + "x" * 70,
                           "Fechou [[2026-01-10 Cobrança recorrente]].", resumo="r " * 120,
                           tags=["Cobrança Recorrente", "b", "c", "d"], data="2026-02-08")
    confere("Salva:" in saida and "Padrao: titulo com 87 caracteres" in saida
            and "Padrao: resumo com 239 caracteres" in saida and "Padrao: 4 tags" in saida,
            "salvar_nota avisa titulo, resumo e tags fora do padrao, e salva mesmo assim")
    confere("Padrao: secoes do padrao ausentes: ## O que mudou, ## Verificação, ## Pendências" in saida,
            "evolucao sem as tres secoes e avisada")
    confere("Linkadas ainda ativas: [[2026-01-10 Cobrança recorrente]]" in saida and "status=resolvido" in saida,
            "evolucao que linka spec ativa sugere marca-la resolvida")
    nota = le("pagamentos/Evolucoes/2026-02-08 Fecha a cobranca " + "x" * 70 + ".md")
    confere("tags: [cobranca-recorrente, b, c, d]" in nota, "tags viram kebab-case sem acento")
    saida = sv.salvar_nota("pagamentos", "bug", "Bug no padrao", "Abertura.\n\n## Sintoma\n\ns\n\n## Causa raiz\n\nc\n\n## Correção\n\nc\n",
                           resumo="bug no padrao", data="2026-02-09")
    confere("Padrao:" not in saida, "sinonimo de secao (Causa raiz) conta como a secao do padrao")
    saida = sv.salvar_nota("pagamentos", "plano", "T2 Ticket sem secoes", "c", resumo="r",
                           artefato="2026-01-10 Cobrança recorrente", data="2026-02-09")
    confere("secoes do padrao" not in saida, "ticket fica fora da checagem de secoes")

    # --- atualizar_nota ---
    saida = sv.atualizar_nota("2026-02-01 Nota bug", status="resolvido", resumo="bug fechado", tags=["a", "b"])
    nota = le("pagamentos/Bugs/2026-02-01 Nota bug.md")
    confere("status: resolvido" in nota and "tags: [a, b]" in nota, "atualizar_nota muda status e tags no frontmatter")
    confere("- [[2026-02-01 Nota bug]] — bug fechado" in le("pagamentos/pagamentos.md"), "atualizar_nota troca o resumo no hub")
    sv.atualizar_nota("2026-02-01 Nota bug", corpo="Corpo novo.")
    nota = le("pagamentos/Bugs/2026-02-01 Nota bug.md")
    confere("Corpo novo." in nota and "\n---\n\n# Nota bug" in nota and "status: resolvido" in nota,
            "corpo novo preserva frontmatter, a linha em branco e recebe o titulo")
    sv.atualizar_nota("2026-02-01 Nota evolucao", sucessora="2026-02-01 Nota bug")
    nota = le("pagamentos/Evolucoes/2026-02-01 Nota evolucao.md")
    confere("status: obsoleto" in nota and "Substituída por [[2026-02-01 Nota bug]]." in nota, "sucessora marca obsoleta e linka")
    for args, erro in ((dict(nota="Nota", status="ativo"), "uma nota bate"),
                       (dict(nota="pagamentos", status="ativo"), "hub e indice"),
                       (dict(nota="nada disso", status="ativo"), "nao encontrada"),
                       (dict(nota="2026-02-01 Nota bug"), "ao menos um")):
        try:
            sv.atualizar_nota(**args)
            confere(False, f"deveria recusar {args}")
        except sv.ErroUso as e:
            confere(erro in str(e), f"atualizar_nota recusa {args}")

    # --- protocolo ---
    saida = io.StringIO()
    with contextlib.redirect_stdout(saida):
        sv.atender({"jsonrpc": "2.0", "id": 1, "method": "initialize",
                    "params": {"protocolVersion": "2025-06-18"}})
        sv.atender({"jsonrpc": "2.0", "method": "notifications/initialized"})
        sv.atender({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
    linhas = [json.loads(l) for l in saida.getvalue().splitlines()]
    confere(len(linhas) == 2 and linhas[0]["result"]["protocolVersion"] == "2025-06-18", "initialize responde e notificacao nao")
    nomes = [t["name"] for t in linhas[1]["result"]["tools"]]
    confere(nomes == [f["name"] for f in sv.FERRAMENTAS] and all("fn" not in t for t in linhas[1]["result"]["tools"]),
            "tools/list expoe as ferramentas sem o campo fn")
    texto, erro = chamada("ler_nota", nota="2026-02-01 Nota bug")
    confere(not erro and "Corpo novo." in texto, "tools/call executa")
    texto, erro = chamada("salvar_nota", projeto="pagamentos", tipo="spec", titulo="X", corpo="c")
    confere(erro and "resumo" in texto, "tools/call devolve ErroUso como isError")
    texto, erro = chamada("ler_nota", inexistente=1)
    confere(erro and "argumentos invalidos" in texto, "argumento desconhecido vira isError")
    texto, erro = chamada("nao_existe")
    confere(erro == "erro-jsonrpc" and "desconhecida" in texto, "ferramenta desconhecida vira erro JSON-RPC")


def testes_cache():
    caminho = os.path.join(sv.VAULT, "pagamentos", "Bugs", "2026-02-01 Nota bug.md")
    antes = sv.notas()
    de_novo = sv.notas()
    n1 = next(n for n in antes if n["rel"].endswith("Nota bug.md"))
    n2 = next(n for n in de_novo if n["rel"].endswith("Nota bug.md"))
    confere(n1 is n2, "arquivo sem mudanca vem do cache (mesmo objeto)")
    with open(caminho, "a", encoding="utf-8") as f:
        f.write("\nLinha nova.\n")
    n3 = next(n for n in sv.notas() if n["rel"].endswith("Nota bug.md"))
    confere(n3 is not n1 and "Linha nova." in n3["texto"], "arquivo alterado e relido")
    confere("linha nova." in n3["norm"] and n3["links"] == n1["links"] and n3["nome_norm"] == "2026-02-01 nota bug",
            "texto normalizado, nome normalizado e links acompanham a releitura")
    versao = sv._VERSAO
    sv.notas()
    confere(sv._VERSAO == versao, "sem mudanca a versao do conjunto nao sobe")
    os.remove(caminho)
    confere(not any(n["rel"].endswith("Nota bug.md") for n in sv.notas()), "arquivo apagado some da lista")
    confere(caminho not in sv._CACHE, "e sai do cache")
    confere(sv._VERSAO == versao + 1 and "2026-02-01 Nota bug" not in sv.indice(sv.notas())["por_nome"],
            "remocao sobe a versao e o indice derivado acompanha")


def testes_validar():
    rel = sv.validar()
    # o unico erro e o [[Nao existe]] que testes() gravou de proposito; e nenhuma
    # nota e orfa, porque o servidor lista todas no hub
    confere("Erros: 1" in rel and "E4" in rel and "Avisos: 0" in rel,
            f"vault gravado pelo servidor so tem o E4 deliberado: {rel.splitlines()[-4:]}")
    confere("Padrao de nota" in rel and "A5: 1" in rel and "A6:" in rel and "A7: 1" in rel and "A8: 1" in rel
            and "aviso A5" not in rel, "o padrao de nota entra so contado no relatorio comum")
    pad = sv.validar(tipo="padrao")
    confere("aviso A5" in pad and "Enorme" in pad and "aviso A6" in pad and "sem as secoes do padrao" in pad
            and "E4" not in pad and "Erros: 0" in pad, "validar tipo=padrao lista o padrao e so ele")
    with open(os.path.join(sv.VAULT, "pagamentos", "pagamentos.md"), "a", encoding="utf-8") as f:
        f.write("- [[2026-02-01 Nota adr]]\n- [[2026-02-01 Nota analise]] — " + "longo " * 50 + "\n")
    pad = sv.validar(tipo="padrao")
    # 2 resumos longos: o desta linha e o da evolucao de 239 caracteres que testes() gravou
    confere("A4 pagamentos/pagamentos.md: 1 entrada(s) sem resumo" in pad
            and "A9 pagamentos/pagamentos.md: 2 resumo(s)" in pad, "hub: entrada sem resumo e A4, resumo longo e A9")
    # quebra de proposito, por fora do servidor, e o linter tem que ver
    with open(os.path.join(sv.VAULT, "pagamentos", "Analises", "solta.md"), "w", encoding="utf-8") as f:
        f.write("# Solta\n\nsem frontmatter, fora do hub\n")
    with open(os.path.join(sv.VAULT, "pagamentos", "Analises", "torta.md"), "w", encoding="utf-8") as f:
        f.write("---\nprojeto: pagamentos\ntipo: relatorio\nstatus: ativo\n---\n# Torta\n\n[[Nao existe]]\n")
    # [[Specs/...]] e link valido no Obsidian: o E4 nao pode acusar caminho
    with open(os.path.join(sv.VAULT, "pagamentos", "Analises", "comcaminho.md"), "w", encoding="utf-8") as f:
        f.write("---\nprojeto: pagamentos\ntipo: analise\nstatus: ativo\ndata: 2026-01-10\n---\n"
                "# Com caminho\n\n[[Specs/2026-01-10 Cobrança recorrente]]\n")
    erros, avisos, totais = sv.validar_vault()
    confere(not any(c == "E4" and "Cobrança recorrente" in m for c, _, m in erros),
            "wikilink com caminho nao e E4")
    b = sv.buscar("sem frontmatter")
    confere("solta.md" in b and '"' in b.split("solta.md", 1)[1][:160], "nota fora do hub cai no trecho da busca")
    codigos = sorted({c for c, _, _ in erros})
    confere(codigos == ["E1", "E2", "E3", "E4", "E5"], f"linter acha E1..E5: {codigos}")
    confere(any(c == "E2" and "'data'" in m for c, _, m in erros), "campo data ausente e E2")
    confere(any(c == "E3" and "relatorio" in m for c, _, m in erros), "tipo fora do vocabulario e E3")
    confere(totais["projetos"] == 2, "totais contam os projetos")
    # duas notas com o MESMO nome em projetos diferentes sao duas notas
    antes = sv.validar_vault()[2]["notas"]
    with open(os.path.join(sv.VAULT, "pagamentos", "Analises", "Homonima.md"), "w", encoding="utf-8") as f:
        f.write("---\nprojeto: pagamentos\ntipo: analise\nstatus: ativo\ndata: 2026-01-10\n---\n# H\n\n[[pagamentos]]\n")
    os.makedirs(os.path.join(sv.VAULT, "pagamentos-repo", "Analises"), exist_ok=True)
    with open(os.path.join(sv.VAULT, "pagamentos-repo", "Analises", "Homonima.md"), "w", encoding="utf-8") as f:
        f.write("---\nprojeto: pagamentos-repo\ntipo: analise\nstatus: ativo\ndata: 2026-01-10\n---\n# H\n\n[[pagamentos-repo]]\n")
    confere(sv.validar_vault()[2]["notas"] == antes + 2, "homonimas de projetos diferentes contam as duas")
    so_fm = sv.validar(tipo="frontmatter")
    confere("E4" not in so_fm and "E1" in so_fm, "filtro tipo=frontmatter")
    so_proj = sv.validar(projeto="pagamentos-repo")
    confere("solta.md" not in so_proj, "filtro por projeto")
    confere("Erros:" in sv.relatorio_validacao([], [], totais, so_placar=True)
            and "Nada" not in sv.relatorio_validacao([], [], totais, so_placar=True), "so_placar imprime so o placar")
    # projeto so com hub nao ganha linha propria na visao geral
    os.makedirs(os.path.join(sv.VAULT, "vazio"), exist_ok=True)
    with open(os.path.join(sv.VAULT, "vazio", "vazio.md"), "w", encoding="utf-8") as f:
        f.write("---\nprojeto: vazio\ntipo: hub\nstatus: ativo\ndata: 2026-01-01\ntags: [hub]\n---\n\n# vazio\n\nNada. Hub global: [[Home]].\n")
    vg = sv.visao_geral()
    confere("- 1 projeto(s) so com hub, sem notas: vazio" in vg and "- vazio —" not in vg and "- pagamentos —" in vg,
            "visao_geral agrupa os projetos sem notas numa linha")


def testes_reorganizar():
    # --- renomear: arquivo, titulo e os wikilinks de quem aponta (hub inclusive) ---
    saida = sv.renomear_nota("2026-02-03 Com link", "Com link renomeada")
    confere("Renomeada: pagamentos/Analises/2026-02-03 Com link.md -> pagamentos/Analises/2026-02-03 Com link renomeada.md" in saida
            and "Wikilinks reescritos em 2 nota(s)" in saida, f"renomear move e conta os links reescritos: {saida.splitlines()[:2]}")
    confere(not existe("pagamentos/Analises/2026-02-03 Com link.md") and existe("pagamentos/Analises/2026-02-03 Com link renomeada.md"),
            "arquivo movido")
    nota = le("pagamentos/Analises/2026-02-03 Com link renomeada.md")
    confere("# Com link renomeada" in nota and "[[Nao existe]]" in nota, "titulo trocado e conteudo preservado")
    hub = le("pagamentos/pagamentos.md")
    confere("[[2026-02-03 Com link renomeada]] — r" in hub and "[[2026-02-03 Com link]]" not in hub, "hub reescrito")
    confere("Deriva de [[2026-02-03 Com link renomeada]]" in le("pagamentos/Analises/2026-02-05 Vizinha.md"), "link em outra nota reescrito")
    # a colisao e por nome completo: mesma data e mesmo titulo no mesmo projeto
    for args, erro in ((dict(nota="pagamentos", novo_titulo="x"), "hub e mapa"),
                       (dict(nota="2026-02-01 Nota adr", novo_titulo="Nota bug"), "ja existe"),
                       (dict(nota="2026-02-05 Vizinha", novo_titulo="Vizinha"), "ja se chama")):
        try:
            sv.renomear_nota(**args)
            confere(False, f"deveria recusar {args}")
        except sv.ErroUso as e:
            confere(erro in str(e), f"renomear recusa {args}")

    # --- dividir: Enorme (## A, ## B) vira abertura + indice, e dois anexos fora do hub ---
    saida = sv.dividir_nota("2026-02-07 Enorme")
    confere("Dividida: pagamentos/Specs/2026-02-07 Enorme.md em 2 anexo(s)" in saida, f"dividir: {saida.splitlines()[0]}")
    mae = le("pagamentos/Specs/2026-02-07 Enorme.md")
    confere(len(mae) < 1000 and "\n---\n\n# Enorme" in mae and "## Anexos" in mae and "[[2026-02-07 Enorme - 01 A]]" in mae
            and "[[2026-02-07 Enorme - 02 B]]" in mae and "Abertura da enorme." in mae, "nota-mae vira abertura + indice")
    parte = le("pagamentos/Specs/2026-02-07 Enorme - 02 B.md")
    confere(parte.startswith("---\nprojeto: pagamentos\ntipo: spec\n") and "\nparte_de: 2026-02-07 Enorme\n---\n\n# B" in parte
            and "Parte 2 de 2 de [[2026-02-07 Enorme]]" in parte and parte.count("x" * 200) == 100,
            "anexo fica ao lado, com o frontmatter da mae mais parte_de, o titulo da secao e o conteudo inteiro")
    erros, avisos, _ = sv.validar_vault(projeto="pagamentos")
    confere(not any(c == "E5" and "Enorme - " in o for c, o, _ in erros) and not any(c == "A5" for c, _, _ in avisos)
            and not any(c in ("A6", "A8") and "Enorme" in o for c, o, _ in avisos),
            "anexos e nota-mae nao sao cobrados no hub nem no padrao de secoes e nome, e a nota grande sumiu do A5")
    confere("Nota grande" not in sv.ler_nota("2026-02-07 Enorme") and "xxxx" in sv.ler_nota("Enorme - 02 B"),
            "a mae ja nao devolve esboco e o anexo se acha pelo nome")
    for args, erro in ((dict(nota="2026-02-07 Enorme"), "ja dividida"), (dict(nota="2026-02-05 Vizinha"), "ao menos duas")):
        try:
            sv.dividir_nota(**args)
            confere(False, f"deveria recusar {args}")
        except sv.ErroUso as e:
            confere(erro in str(e), f"dividir recusa {args}")


def testes_git():
    vault = sv.VAULT
    subprocess.run(["git", "-C", vault, "init", "-q", "-b", "main"], check=True)
    subprocess.run(["git", "-C", vault, "config", "user.email", "t@local"], check=True)
    subprocess.run(["git", "-C", vault, "config", "user.name", "teste"], check=True)
    saida = sv.salvar_nota("loja", "spec", "Primeira", "c", resumo="r", descricao_projeto="Loja")
    confere("Git: commit local (vault sem remoto)" in saida, "vault git sem remoto: commit local")
    log = subprocess.run(["git", "-C", vault, "log", "--format=%s"], capture_output=True, text=True).stdout
    confere(log.strip() == "loja: Primeira", "mensagem do commit e projeto: titulo")
    limpo = subprocess.run(["git", "-C", vault, "status", "--porcelain"], capture_output=True, text=True).stdout
    confere(limpo == "", "working tree do vault fica limpa apos gravar")
    sv.SEM_GIT = True
    saida = sv.salvar_nota("loja", "bug", "Segunda", "c", resumo="r")
    confere("sem git" in saida, "--sem-git nao commita")
    sv.SEM_GIT = False
    # lote: N gravacoes, um commit
    for i in range(3):
        saida = sv.salvar_nota("loja", "spec", f"Lote {i}", "c", resumo="r", lote=True)
        confere("pendente (lote)" in saida, f"lote=true nao commita ({i})")
    saida = sv.atualizar_nota("Segunda", status="resolvido", lote=True)
    confere("pendente (lote)" in saida, "atualizar_nota lote=true nao commita")
    # outra sessao grava no vault enquanto o lote esta aberto: o `add -A` levaria junto
    intruso = "de-outra-sessao.md"
    with open(os.path.join(vault, intruso), "w", encoding="utf-8") as f:
        f.write("nao e do lote\n")
    antes = subprocess.run(["git", "-C", vault, "rev-list", "--count", "HEAD"], capture_output=True, text=True).stdout.strip()
    try:
        sv.sincronizar_lote("")
        confere(False, "sincronizar sem mensagem deveria ser recusado")
    except sv.ErroUso:
        confere(True, "sincronizar exige mensagem")
    saida = sv.sincronizar_lote("loja: lote de 3 specs")
    depois = subprocess.run(["git", "-C", vault, "rev-list", "--count", "HEAD"], capture_output=True, text=True).stdout.strip()
    confere(int(depois) == int(antes) + 1 and "commit local" in saida, "sincronizar fecha o lote num commit so")
    confere(saida.startswith("5 arquivo(s) no lote"), f"sincronizar conta os arquivos do lote: {saida}")
    log = subprocess.run(["git", "-C", vault, "log", "-1", "--format=%s"], capture_output=True, text=True).stdout.strip()
    confere(log == "loja: lote de 3 specs", "mensagem do lote e a passada")
    confere(intruso in subprocess.run(["git", "-C", vault, "status", "--porcelain"],
                                      capture_output=True, text=True).stdout,
            "arquivo de outra sessao NAO entra no commit do lote")
    confere("0 arquivo(s) no lote" in sv.sincronizar_lote("nada"), "lote vazio diz que nao ha o que commitar")


def main():
    base = tempfile.mkdtemp(prefix="vault-teste-")
    try:
        sv.VAULT = os.path.join(base, "projetos")
        os.makedirs(sv.VAULT)
        sv.SEM_GIT = True
        testes()
        testes_validar()   # antes do cache, que apaga uma nota linkada e criaria outro E4
        testes_reorganizar()
        testes_cache()
        shutil.rmtree(sv.VAULT)
        os.makedirs(sv.VAULT)
        sv._CACHE.clear()  # mesmo caminho, vault novo: o cache da fase 1 nao vale
        sv.SEM_GIT = False
        if shutil.which("git"):
            testes_git()
        else:
            print("git ausente: testes de sincronizacao pulados")
    finally:
        shutil.rmtree(base, ignore_errors=True)
    if FALHAS:
        print("\nFALHOU:")
        for f in FALHAS:
            print("  " + f)
        sys.exit(1)
    print("\ntudo ok")


if __name__ == "__main__":
    main()
