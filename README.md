# Absolute Sudoku

Um Sudoku local-first, preciso e acessível. A aplicação não depende de conta,
backend ou conexão depois da primeira carga.

## Acesso online

A versão publicada do projeto está disponível em
[sudoku-zeta-rosy.vercel.app](https://sudoku-zeta-rosy.vercel.app/).

## Versionamento

A versão atual é `0.5.0`. O histórico técnico por versão está em
[CHANGELOG.md](CHANGELOG.md), com escopo funcional, alterações de arquitetura e
marcadores de compatibilidade.

O projeto segue SemVer. Cada release deve atualizar `package.json` e
`package-lock.json`, registrar a mudança no changelog e manter explícitos os
marcadores de formato persistido. Alterações no algoritmo determinístico de
geração devem incrementar `GENERATOR_VERSION`; alterações incompatíveis no
event log, no arquivo, na prática ou no backup devem atualizar seus respectivos
schemas e documentar a migração.

Marcadores atuais: `GENERATOR_VERSION = 4`, `EVENT_LOG_VERSION = 1`,
`STORAGE_SCHEMA_VERSION = 4`, `ARCHIVED_GAME_VERSION = 1`,
`PRACTICE_VERSION = 1`, `PRACTICE_PROGRESS_VERSION = 1` e
`DATA_BACKUP_VERSION = 2`. Saves anteriores e backups v1 migram automaticamente.

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
  locais, arquivo permanente de partidas e retomada após recarga ou
  encerramento.
- Várias partidas em andamento, com acesso rápido à última, prévias das grades,
  progresso, organização e exclusão individual. Cada tentativa preserva suas
  notas, cores, seleção, dicas, tempo e histórico; começar outra não a substitui.
- Histórico de eventos por partida e análise pós-jogo, com reprodução de cada
  movimento, mudanças realizadas, comparação com o caminho lógico e acesso
  direto aos momentos que merecem revisão.
- Prática offline por dez técnicas, dos singles ao XY-Wing, com grades
  determinísticas calibradas, variações preservadoras de lógica e progresso
  separado das estatísticas de partidas comuns.
- Backup integral em JSON com verificação de integridade, prévia antes da
  restauração e exclusão local explícita em duas etapas.
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
- `npm run test:ui`: testa a jogabilidade no Chromium, Firefox, WebKit e
  Chromium com emulação móvel. Instale os navegadores uma vez com
  `npx playwright install chromium firefox webkit`. O servidor de teste usa
  a porta 4187; os testes usam sessões isoladas e não alteram suas partidas.
- `npm run typecheck`: valida TypeScript sem emitir arquivos.
- `npm run lint`: executa ESLint com regras para React, hooks, TypeScript e
  imports.

## Arquitetura

- `src/domain`: regras, catálogo e modelos de Sudoku independentes da interface.
- `src/engine`: topologia, solver exato, solver humano, gerador, prática por
  técnica e Web Worker.
- `src/game`: reducer, histórico reversível, event log, relógio, persistência,
  arquivo, revisão semântica, estatísticas, backup e share.
- `src/ui`: aplicação React e experiência adaptativa.
- `public`: ícones e ativos estáticos instaláveis.
- `vite.config.ts`: manifesto, precache e ciclo de atualização do PWA.

O estado é local e a geração é determinística por seed. A calibração cobre
singles, candidatos bloqueados, pares, trincas, quartetos, X-Wing, Skyscraper,
Swordfish, XY-Wing e Jellyfish. A camada de domínio permanece pura e testável;
React cuida somente da interação e da apresentação.

## Dados locais e backup

**Partidas salvas**, abaixo de “Continuar” e no menu da partida, reúne as grades
em andamento por última atividade. A troca pausa e salva a partida atual antes
de abrir outra. O desafio diário retoma a tentativa do dia já iniciada. Partidas
concluídas passam para o arquivo, sem ocupar a lista de jogos em andamento.
“Organizar” revela a exclusão individual com confirmação na própria linha.

Partidas em andamento, preferências, estatísticas, práticas e partidas
concluídas permanecem neste dispositivo. Em **Ajustes → Dados**, “Exportar
backup” cria um arquivo JSON portátil; “Restaurar backup” valida formato,
versão, integridade e conteúdo antes de pedir confirmação. A restauração
substitui o conjunto local completo. “Apagar dados” exige uma segunda ação e
remove todo o conteúdo local do aplicativo.

O schema de armazenamento v4 usa IndexedDB v5, com registros independentes por
tentativa e um índice leve para a lista. O save único anterior e checkpoints
pendentes são recuperados sem duplicar a tentativa. O backup v2 inclui todas
as partidas salvas e continua aceitando arquivos v1. Se o navegador não puder
gravar nem no IndexedDB nem no fallback local, o aplicativo informa a falha e
mantém o progresso em memória para exportação.

O arquivo de partidas fica em **Seu jogo**. Partidas novas preservam o estado
final e, quando o log é compatível, toda a linha do tempo. Registros antigos que
existiam apenas nas estatísticas continuam visíveis, mas não podem reconstruir
movimentos que nunca foram armazenados.

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
npm run test:ui
npm run build
```

Valide também teclado, leitor de tela, toque, orientação retrato e paisagem,
tema claro e escuro, movimento reduzido e uma recarga completa sem conexão.
