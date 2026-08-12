# Absolute Sudoku

Um Sudoku local-first, preciso e acessível. A aplicação não depende de conta,
backend ou conexão depois da primeira carga.

## Versionamento

A versão atual é `0.2.0`. O histórico técnico por versão está em
[CHANGELOG.md](CHANGELOG.md), com escopo funcional, alterações de arquitetura e
marcadores de compatibilidade.

O projeto segue SemVer. Cada release deve atualizar `package.json` e
`package-lock.json`, registrar a mudança no changelog e manter explícitos os
marcadores de formato persistido. Alterações no algoritmo determinístico de
geração devem incrementar `GENERATOR_VERSION`; alterações incompatíveis no
event log ou no armazenamento devem atualizar seus respectivos schemas e
documentar a migração.

Marcadores atuais: `GENERATOR_VERSION = 3`, `EVENT_LOG_VERSION = 1` e
`STORAGE_SCHEMA_VERSION = 2`.

## O que já está incluído

- Sudoku clássico, diagonal e anti-cavalo com geração determinística e solução
  única.
- Cinco intensidades calibradas pelo solver humano, desafios diários offline e
  geração que só aceita grades lógicas, únicas e com simetria rotacional.
- Entrada por célula, teclado físico e seleção múltipla; notas de canto e
  centro, cores, candidatos automáticos e contagem restante opcional.
- Undo/redo integral, dicas progressivas, quatro políticas de erro, pausa e
  cronômetro que ignora o tempo em segundo plano.
- Autosave serializado no IndexedDB, migrações, fallback seguro, estatísticas
  locais e retomada após recarga ou encerramento.
- Histórico de eventos por partida e análise pós-jogo, com reprodução de cada
  movimento e leitura da técnica mais avançada exigida pela grade.
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
- `npm run lint`: executa ESLint com regras para React, hooks, TypeScript e
  imports.

## Arquitetura

- `src/domain`: regras, catálogo e modelos de Sudoku independentes da interface.
- `src/engine`: topologia, solver exato, solver humano, gerador e Web Worker.
- `src/game`: reducer, histórico reversível, event log, relógio, persistência,
  estatísticas e share.
- `src/ui`: aplicação React e experiência adaptativa.
- `public`: ícones e ativos estáticos instaláveis.
- `vite.config.ts`: manifesto, precache e ciclo de atualização do PWA.

O estado é local e a geração é determinística por seed. A calibração cobre
singles, candidatos bloqueados, pares, trincas, quartetos, X-Wing, Skyscraper,
Swordfish, XY-Wing e Jellyfish. A camada de domínio permanece pura e testável;
React cuida somente da interação e da apresentação.

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
npm run lint
npm test
npm run build
```

Valide também teclado, leitor de tela, toque, orientação retrato e paisagem,
tema claro e escuro, movimento reduzido e uma recarga completa sem conexão.
