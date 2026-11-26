// O espelho do pane no herdr-app: a mesma tabela de elementos, com o Button e o Input guardando os
// efeitos pela key. O mod painel-macrex do herdr-app desenha a arvore em JSON e devolve so a key
// do que foi clicado ou digitado; o nucleo acha aqui o efeito e o roda. Puro.

import type { Elementos } from './primitivas.ts'

export type Pedido = { id: number; key: string; tipo: 'press' | 'input' | 'submit'; texto?: string }

export function espelho(elementos: Elementos) {
  const efeitos = new Map<string, (texto?: string) => unknown>()
  type Props = Record<string, unknown> & { key: string }
  const Button = (p: Props & { onPress?: () => unknown }) => {
    efeitos.set(`press:${p.key}`, () => p.onPress?.())
    return (elementos.Button as (p: Props) => unknown)(p)
  }
  const Input = (p: Props & { onInput?: (t: string) => unknown; onSubmit?: (t: string) => unknown }) => {
    efeitos.set(`input:${p.key}`, t => p.onInput?.(t ?? ''))
    efeitos.set(`submit:${p.key}`, t => p.onSubmit?.(t ?? ''))
    return (elementos.Input as (p: Props) => unknown)(p)
  }
  return { elementos: { ...elementos, Button, Input } as unknown as Elementos, efeito: (p: Pedido) => efeitos.get(`${p.tipo}:${p.key}`) }
}
