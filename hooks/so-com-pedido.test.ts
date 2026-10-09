// Testes do so-com-pedido (hooks/so-com-pedido.js, ligado pela opcao so_com_pedido): commit e
// push so no turno em que o usuario pediu. Rode com `claude plugin test .` na raiz do repositorio.
import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const LIGADO = { options: { so_com_pedido: true } }

// o shell que responde ok, a mensagem digitada (ou de outra origem) e o /cpv
function mundo($: Engine, on: On) {
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ok' }) as never)
  on('tool.call', { tool: 'PowerShell' }, () => ({ result: 'ok' }) as never)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('skill.prompt', ($, e) => ({ text: e.text }))
  return {
    digita: (text: string) => $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } } as never),
    // digitada com um turno rodando: o prompt.submit sai no Enter, com o id dele
    noMeio: (text: string) => $.prompt.submit({ text, wait: false, turnId: 't1', origin: { kind: 'composer' } } as never),
    plugin: (text: string) => $.prompt.submit({ text, wait: false, origin: { kind: 'plugin', name: 'outro' } } as never),
    cpv: (skill = 'macrex-skills:cpv') => $.skill.prompt({ skill, text: 'x' }),
    bash: (command: string, agentId?: string) => $.tool.call({ tool: 'Bash', command, ...(agentId ? { agentId } : {}) } as never),
    ps: (command: string) => $.tool.call({ tool: 'PowerShell', command } as never),
  }
}

describe('so com pedido', () => {
  test('sem pedido na mensagem, commit, push e PR sao barrados com o motivo', LIGADO, async ($, on) => {
    const { digita, bash, ps } = mundo($, on)
    await digita('corrige o teste do painel')
    for (const comando of [
      'git commit -m x', 'git push origin main', 'gh pr create --fill', 'gh pr merge 3 --squash', 'git -C "D:/a b" commit -am x', 'git --no-pager -c user.name=x push',
      'gh --repo o/r pr merge 3', 'gh -R o/r pr create --fill', 'git -c user.name="A B" commit -m x', 'git -C x --no-pager push',
    ]) {
      expect((await bash(comando)).deny).toMatch(/nao pediu commit\/push nesta mensagem; deixe na working tree/)
    }
    expect((await ps('git push')).deny).toBeDefined()
    expect((await ps('& "C:\\Program Files\\Git\\cmd\\git.exe" commit -m x')).deny).toBeDefined()
  })

  test('o encadeado por ;, &&, | e o de dentro de $( ) tambem sao barrados', LIGADO, async ($, on) => {
    const { digita, bash } = mundo($, on)
    await digita('roda os testes')
    for (const comando of ['git add . && git commit -m x', 'git status; git push', 'echo ok | git commit -F -', 'x=$(git commit -m y)']) {
      expect((await bash(comando)).deny).toBeDefined()
    }
  })

  test('leitura passa sem pedido', LIGADO, async ($, on) => {
    const { digita, bash } = mundo($, on)
    await digita('o que mudou?')
    for (const comando of ['git status', 'git log --grep commit', 'git diff HEAD', 'git stash push -m tag', 'gh pr view 3', 'gh --repo o/r pr view 3', 'git branch -m push']) {
      expect((await bash(comando)).result).toBe('ok')
    }
  })

  test('"commita e da push" libera o turno inteiro, sub-agente inclusive, e o proximo prompt derruba', LIGADO, async ($, on) => {
    const { digita, plugin, bash } = mundo($, on)
    await digita('commita e da push')
    expect((await bash('git commit -m x')).result).toBe('ok')
    expect((await bash('git push', 'agente-1')).result).toBe('ok')

    await digita('agora ajusta o README')
    expect((await bash('git push')).deny).toBeDefined()

    // a mensagem de plugin nao pede, mesmo com a palavra
    await digita('publica')
    await plugin('commit e push agora')
    expect((await bash('git push')).deny).toBeDefined()
  })

  test('o /cpv libera o turno dele, venha o skill.prompt antes ou depois do prompt.submit', LIGADO, async ($, on) => {
    const { digita, cpv, bash } = mundo($, on)
    await cpv()
    await digita('/cpv')
    expect((await bash('git commit -m x && git push')).result).toBe('ok')
    await digita('/macrex-skills:cpv sem-vault')
    await cpv()
    expect((await bash('git push')).result).toBe('ok')

    // sem o prefixo do plugin tambem
    await digita('mais uma coisa')
    expect((await bash('git push')).deny).toBeDefined()
    await cpv('cpv')
    expect((await bash('git push')).result).toBe('ok')
  })

  test('a mensagem digitada com o turno rodando nao tira o pedido dele, so acrescenta', LIGADO, async ($, on) => {
    const { digita, noMeio, cpv, bash } = mundo($, on)
    await digita('/cpv')
    await cpv()
    await noMeio('ah, e confere o README')
    expect((await bash('git push')).result).toBe('ok')

    await digita('roda os testes')
    await noMeio('e depois commita')
    expect((await bash('git commit -m x')).result).toBe('ok')
  })

  test('com a opcao desligada nada e barrado', async ($, on) => {
    const { digita, bash } = mundo($, on)
    await digita('corrige o teste')
    expect((await bash('git commit -m x')).result).toBe('ok')
  })
})
