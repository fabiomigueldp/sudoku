# Absolute Sudoku

Um Sudoku local-first, preciso e acessível. A aplicação não depende de conta,
backend ou conexão depois da primeira carga.

## O que já está incluído

- Sudoku clássico, diagonal e anti-cavalo com geração determinística e solução
  única.
- Cinco intensidades, desafios diários offline e análise de dificuldade por
  técnicas humanas.
- Entrada por célula, teclado físico e seleção múltipla; notas de canto e
  centro, cores, candidatos automáticos e contagem restante opcional.
- Undo/redo integral, dicas progressivas, quatro políticas de erro, pausa e
  cronômetro que ignora o tempo em segundo plano.
- Autosave no IndexedDB, migrações, fallback seguro, estatísticas locais e
  retomada após recarga ou encerramento.
- Importação de grades com validação de unicidade e compartilhamento do estado
  completo por código versionado.
- Temas claro, escuro e do sistema, alto contraste, redução de movimento,
  grade WAI-ARIA e fluxo responsivo de 320px a ultrawide.

## Executar

Requer Node.js 22 ou superior.

```bash
npm install
npm run dev
```

Comandos principais:

- `npm run build`: valida os tipos e cria a versão de produção.
- `npm run preview`: serve localmente a versão de produção.
- `npm test`: executa os testes uma vez.
- `npm run test:watch`: acompanha os testes durante o desenvolvimento.
- `npm run typecheck`: valida TypeScript sem emitir arquivos.

## Arquitetura

- `src/domain`: regras, catálogo e modelos de Sudoku independentes da interface.
- `src/engine`: topologia, solver exato, solver humano, gerador e Web Worker.
- `src/game`: reducer, histórico, relógio, persistência, estatísticas e share.
- `src/ui`: aplicação React e experiência adaptativa.
- `public`: ícones e ativos estáticos instaláveis.
- `vite.config.ts`: manifesto, precache e ciclo de atualização do PWA.

O estado é local e a geração é determinística por seed. A camada de domínio deve
permanecer pura e testável; React cuida somente da interação e da apresentação.

## PWA e modo offline

O build gera um service worker com o app shell e todos os ativos próprios em
precache. Navegações sem rede retornam à aplicação, inclusive os atalhos
“Continuar” e “Desafio diário”. Atualizações ficam aguardando confirmação, sem
recarregar uma partida em andamento. Para testar instalação e offline, use
`npm run build && npm run preview`; service workers não são habilitados no modo
de desenvolvimento.

## Qualidade

Antes de entregar uma mudança, execute:

```bash
npm run typecheck
npm test
npm run build
```

Valide também teclado, leitor de tela, toque, orientação retrato e paisagem,
tema claro e escuro, movimento reduzido e uma recarga completa sem conexão.
