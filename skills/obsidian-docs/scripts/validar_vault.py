#!/usr/bin/env python3
"""Linter do vault Obsidian, na linha de comando.

E a mesma checagem da ferramenta `validar` do MCP vault-docs: o vocabulario
(tipos, status), o parser de frontmatter e a leitura das notas vem de
servidor_vault.py, ao lado deste arquivo — nao ha segunda copia para divergir.

Uso (de onde a skill esta instalada):
  python scripts/validar_vault.py --vault ~/obsidian/projetos    # relatorio + exit 1 se houver erro
  python scripts/validar_vault.py --resumo                        # so o placar (vault de OBSIDIAN_VAULT)
  python scripts/validar_vault.py --tipo orfas                    # so uma checagem
  python scripts/validar_vault.py --projeto pagamentos            # so um projeto

Checagens:
  E1 nota sem frontmatter
  E2 campo obrigatorio ausente (projeto, tipo, status, data)
  E3 valor fora do vocabulario (tipo/status)
  E4 wikilink apontando para nota inexistente
  E5 nota de projeto nao listada no hub do projeto
  A1 (aviso) nota orfa: ninguem linka para ela
  A2 (aviso) nota sem nenhum wikilink de saida
  A3 (aviso) projeto sem hub
  Padrao de nota, so contado por padrao e listado com --tipo padrao:
  A4 entrada de hub sem resumo, A5 nota acima do teto, A6 secoes do padrao
  ausentes, A7 mais de 3 tags, A8 nome longo, A9 resumo do hub longo
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import servidor_vault as sv  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--vault", default=None,
                    help="pasta de projetos do vault (senao OBSIDIAN_VAULT)")
    ap.add_argument("--resumo", action="store_true", help="so o placar")
    ap.add_argument("--tipo", default=None, help="orfas | frontmatter | links | hub")
    ap.add_argument("--projeto", default=None, help="so as notas deste projeto")
    args = ap.parse_args()

    caminho = args.vault or os.environ.get("OBSIDIAN_VAULT")
    if not caminho:
        sys.exit("vault nao informado: passe --vault <pasta de projetos> ou defina OBSIDIAN_VAULT")
    caminho = os.path.abspath(os.path.expanduser(caminho))
    if not os.path.isdir(caminho):
        sys.exit(f"vault nao encontrado: {caminho}")
    sv.VAULT = caminho

    erros, avisos, totais = sv.validar_vault(args.projeto, args.tipo)
    print(sv.relatorio_validacao(erros, avisos, totais, so_placar=args.resumo,
                                 ocultar=() if args.tipo else sv.PADRAO))
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()
