// A arvore do projeto na aba Arquivos: as linhas visiveis, sem efeito.

export const semBarra = (c: string) => c.replace(/\\/g, '/').toLowerCase()

// a pasta da arvore: cada nome leva a pasta de dentro, ou null no arquivo
type No = Map<string, No | null>
export type LinhaDaArvore = { caminho: string; nome: string; nivel: number; pasta: boolean; doFiltro?: boolean }
// As linhas visiveis da arvore: as pastas (com / no fim) antes dos arquivos, em ordem alfabetica,
// e os filhos so das pastas abertas.
export function linhasDaArvore(arquivos: string[], abertas: string[]) {
  const raiz: No = new Map()
  for (const c of arquivos) {
    const partes = c.split('/')
    let no = raiz
    for (const p of partes.slice(0, -1)) {
      if (!(no.get(p) instanceof Map)) no.set(p, new Map())
      no = no.get(p) as No
    }
    no.set(partes.at(-1) as string, null)
  }
  const linhas: LinhaDaArvore[] = []
  const descer = (no: No, prefixo: string, nivel: number) => {
    const nomes = [...no.keys()].sort((a, b) => Number(no.get(a) === null) - Number(no.get(b) === null) || a.localeCompare(b))
    for (const nome of nomes) {
      const pasta = no.get(nome) !== null
      const caminho = `${prefixo}${nome}${pasta ? '/' : ''}`
      linhas.push({ caminho, nome: pasta ? `${nome}/` : nome, nivel, pasta })
      if (pasta && abertas.includes(caminho)) descer(no.get(nome) as No, caminho, nivel + 1)
    }
  }
  descer(raiz, '', 0)
  return linhas
}
