# Conclusão automática

## Referências e decisão

O [Sudoku.coach](https://sudoku.coach/en/about/whats-new) lista a ferramenta
Auto-Naked-Singles. Ela automatiza deduções elementares; é diferente de preencher
anotações ou simplesmente revelar o gabarito. O [Sudoku.com](https://sudoku.com/sudoku-rules/last-free-cell/)
explica a última casa de uma unidade como uma dedução básica.

Não há um limite universal de dez casas estabelecido por essas referências.
No Absolute Sudoku, dez é um limite conservador de produto: evita oferecer uma
conclusão logo no início de uma grade fácil. A quantidade sozinha nunca basta.

## Comportamento

- Nas últimas 1–10 casas, simular a resolução por singles diretos e ocultos.
  Recalcular os candidatos após cada colocação, respeitando a variante.
- Oferecer a ação somente quando essa sequência resolve todo o restante.
  Nunca usar busca, tentativas ou o gabarito para escolher a próxima jogada.
- Conferir os valores existentes e a solução calculada contra o gabarito como
  proteção. Não corrigir entradas erradas nem confiar em notas manuais.
- Mostrar um botão discreto abaixo dos controles, sem mover o tabuleiro,
  interromper a partida, roubar foco ou preencher casas sem um clique.
  Em telas curtas, permitir rolagem para alcançar a ação.
- Enquanto uma dica pedagógica está aberta, preservar sua prioridade.
- Avisar antes do clique que a conclusão conta como uma dica. Isso mantém
  a distinção já existente entre partidas com assistência e partidas sem dicas.
- Revalidar no reducer, aplicar como uma transação, limpar notas somente nas
  casas preenchidas e preservar valores existentes e cores.
- Parar o relógio no clique, sem acrescentar uma animação demorada ao tempo.
- Registrar `game/auto-finish` como um momento de assistência na análise.
- Oferecer desfazer na conclusão; restaurar todas as casas e notas de uma vez.
  Refazer e salvar/restaurar usam o histórico existente.
- Identificar a conclusão pela tentativa salva: concluir novamente após desfazer
  atualiza seu registro e arquivo, sem inflar a contagem de partidas. Tentativas
  independentes continuam com registros independentes.

## Limites deliberados

O recurso não automatiza singles durante toda a partida, não completa uma grade
ambígua apenas porque faltam poucas casas e não resolve técnicas avançadas pelo
jogador. Um botão ausente não diagnostica o motivo: pode haver muitas casas,
valores incorretos ou uma sequência que exige mais que singles.

Uma preferência para automatização contínua seria um recurso separado, com
impacto pedagógico maior. O limite poderá ser ajustado com observação de uso;
o requisito de provar a resolução inteira deve permanecer.
