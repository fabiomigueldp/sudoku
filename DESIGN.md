---
name: Absolute Sudoku
description: Um instrumento sereno e preciso para jogar Sudoku por toda a vida.
colors:
  paper: "oklch(96.4% 0.008 87)"
  paper-raised: "oklch(98.7% 0.006 87)"
  paper-sunken: "oklch(92.8% 0.012 87)"
  ink: "oklch(25% 0.025 255)"
  ink-soft: "oklch(48% 0.024 255)"
  ink-faint: "oklch(53% 0.018 255)"
  line: "oklch(81% 0.012 255)"
  grid-line: "oklch(64% 0.015 255)"
  line-strong: "oklch(39% 0.028 255)"
  accent: "oklch(47% 0.095 245)"
  accent-strong: "oklch(39% 0.105 245)"
  accent-soft: "oklch(90% 0.035 245)"
  danger: "oklch(52% 0.13 27)"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, system-ui, sans-serif"
    fontSize: "4.7rem"
    fontWeight: 690
    lineHeight: 0.98
    letterSpacing: "-0.055em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, system-ui, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 690
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 720
    lineHeight: 1.2
    letterSpacing: "0.09em"
rounded:
  cell: "0px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "18px"
spacing:
  hairline: "1px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper-raised}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "48px"
  button-primary-active:
    backgroundColor: "{colors.accent-strong}"
    textColor: "{colors.paper-raised}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "48px"
  sudoku-cell:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.cell}"
    padding: "0"
  sudoku-cell-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-strong}"
    rounded: "{rounded.cell}"
    padding: "0"
  icon-button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-soft}"
    rounded: "50%"
    width: "44px"
    height: "44px"
---

# Design System: Absolute Sudoku

## Overview

**Creative North Star: "Papel de Precisão"**

A interface deve parecer um instrumento de raciocínio sobre uma folha excepcionalmente bem calibrada. As superfícies são calmas, os limites são exatos e a tipografia nativa desaparece durante o uso. O tabuleiro sempre domina a composição; controles existem na periferia visual e se tornam claros no instante em que são necessários.

O sistema rejeita o visual de jogo mobile sustentado por retenção, o dashboard SaaS e a decoração que pede atenção. Densidade é permitida quando aumenta o poder do jogador, mas complexidade avançada surge progressivamente.

**Key Characteristics:**

- Tabuleiro espacialmente estável em qualquer proporção.
- Neutros levemente aquecidos e um único acento funcional.
- Hierarquia por escala, peso e distância, nunca por containers repetidos.
- Movimento curto, reversível e restrito a mudanças de estado.
- Alvos de 44–48px fora da grade e foco sempre inequívoco.

## Colors

A paleta combina papel marfim com tinta azul-grafite; o azul mineral aparece somente em ação, seleção, foco e números inseridos.

### Primary

- **Azul mineral:** ação primária, foco, valor inserido e modo ativo. Sua raridade mantém o tabuleiro calmo.

### Neutral

- **Papel marfim:** superfície principal de longa permanência.
- **Papel elevado:** células, folhas e controles ativos.
- **Papel rebaixado:** estados pressionados e trilhos de controles.
- **Tinta grafite:** pistas, títulos e informação indispensável.
- **Tinta suave:** texto auxiliar e controles inativos.
- **Linhas calibradas:** divisões finas e estrutura 3×3.

### Named Rules

**The One Voice Rule.** O azul mineral ocupa menos de 10% da tela e nunca é decoração.

**The Paper Is Never White Rule.** Nenhuma superfície usa branco ou preto puros; todo neutral carrega a temperatura do sistema.

**The Color Is Not Meaning Rule.** Conflito, seleção, foco e dica sempre possuem forma, contorno, peso ou texto além da cor.

## Typography

**Display Font:** pilha nativa do sistema, com SF Pro e Segoe UI
**Body Font:** a mesma pilha nativa
**Label/Mono Font:** números tabulares da pilha nativa

**Character:** uma única família mantém o produto familiar em iOS, Android e desktop. A personalidade vem do ajuste rigoroso de peso, tracking e escala, não de uma fonte de exibição.

### Hierarchy

- **Display** (690, até 4.7rem, 0.98): reservado a momentos editoriais raros; não aparece na tela inicial funcional.
- **Headline** (690, 1.35rem, 1.2): títulos de páginas e estados conclusivos.
- **Title** (650, 0.92–1rem, 1.25): opções, linhas e ações principais.
- **Body** (400, 1rem, 1.65): explicações curtas, sempre abaixo de 65ch.
- **Label** (720, 0.72rem, 0.09em, uppercase): categorias e contexto, nunca texto de interação longo.

### Named Rules

**The Native Instrument Rule.** Display fonts são proibidas em tabuleiro, botão, ajuste, número e label.

**The Number Stability Rule.** Cronômetro, estatísticas, candidatos e teclado usam numerais tabulares.

## Elevation

O produto é plano por padrão. Profundidade é criada por mudança tonal, linha e ordem espacial. Sombras aparecem apenas no painel contextual sobreposto e em controles segmentados ativos, sempre amplas e discretas.

### Shadow Vocabulary

- **Resposta baixa** (`0 1px 3px oklch(20% 0.02 255 / 0.09)`): segmento ativo sobre trilho.
- **Folha contextual** (`0 10px 34px oklch(18% 0.02 255 / 0.18)`): dica móvel ou folha temporária.
- **Plano modal** (`0 20px 70px oklch(12% 0.02 255 / 0.24)`): somente opções que precisam ficar sobre uma partida.

### Named Rules

**The Flat-By-Default Rule.** Se uma superfície está em repouso e pode ser separada por espaço ou linha, sombra é proibida.

## Components

### Buttons

- **Shape:** curva discreta (8px), sem formato exageradamente arredondado.
- **Primary:** azul mineral, texto em papel elevado, altura mínima de 48px.
- **Hover / Focus:** escurecimento tonal curto; foco externo de 3px; estado pressionado usa escala de 0.985.
- **Secondary / Ghost:** fundo transparente, linha calibrada ou ausência completa de borda conforme hierarquia.

### Cards / Containers

- **Corner Style:** cards genéricos não existem. Folhas contextuais podem usar 18px.
- **Background:** continuidade com o papel principal.
- **Shadow Strategy:** plano por padrão, conforme Elevation.
- **Border:** separadores de 1px, nunca bordas decorativas laterais.
- **Internal Padding:** varia conforme ritmo; não repetir o mesmo padding em todos os blocos.

### Inputs / Fields

- **Style:** controles nativos preservados quando apropriados; switches usam trilho de 42×25px.
- **Focus:** anel mineral de 3px com offset de 3px.
- **Error / Disabled:** erro usa tinta carmim, fundo tonal e marca de forma; desabilitado mantém estrutura com opacidade de 0.38.

### Navigation

Cabeçalhos são baixos, simétricos e previsíveis. Ícones universais podem aparecer sem texto visual somente quando mantêm nome acessível. Rotas secundárias usam linhas, não abas em cards.

### Home

A tela inicial é uma entrada no instrumento, não uma landing page. A assinatura tipográfica “Absolute Sudoku” é o único título; continuar, desafio diário e novo jogo formam uma coluna central única, plana e delimitada por linhas. Não há hero, manifesto, indicadores permanentes de armazenamento ou conectividade. Estados excepcionais, como uma atualização pronta, só aparecem enquanto exigem uma decisão.

### Sudoku Board

A grade é quadrada, sem radius, com limite externo de 2px, divisões de célula de 1px e divisões 3×3 de 2px. Pistas usam tinta e peso 690; entradas usam azul mineral e peso 530. Seleção tem fundo tonal e contorno interno; a dica usa um marcador tracejado mais interno, para ambos permanecerem legíveis quando coexistem. Conflito tem prioridade cromática, mas nunca apaga seleção, dica ou foco. Candidatos de canto mantêm uma matriz 3×3 estável; marcas centrais fluem em um conjunto compacto sem truncamento. Quando ambos coexistem, a célula separa as duas camadas verticalmente e preserva todos os dígitos.

### Input Rail

Modo, números e ações formam uma única sequência vertical no desktop e compacta no mobile. Número, canto, centro e cor são modos mutuamente exclusivos. Contagem restante é texto pequeno integrado, nunca badge.

## Do's and Don'ts

### Do:

- **Do** preservar o tabuleiro como maior objeto funcional da tela.
- **Do** manter ações essenciais entre 44px e 48px e células acima de 24px.
- **Do** usar transições de 120–180ms somente em opacity, transform e cor.
- **Do** compor por espaço, linhas e alinhamento antes de criar uma superfície.
- **Do** manter a viewport espacialmente estável, safe areas e redução de movimento.
- **Do** revelar candidatos, cores, análise e variantes progressivamente.

### Don't:

- **Don't** usar badges, moedas, troféus, streak pressure, pop-ups promocionais ou toasts rotineiros.
- **Don't** usar emojis decorativos, ícones sem função, glassmorphism ou gradientes chamativos.
- **Don't** transformar cada seção em card ou criar grids de cards idênticos.
- **Don't** usar borda lateral maior que 1px como faixa de destaque.
- **Don't** usar gradient text, branco puro, preto puro ou acento saturado em estado inativo.
- **Don't** impor limite de erros, game over ou animação que interrompa o raciocínio.
- **Don't** esconder uma ação essencial apenas em long press, swipe, double tap ou drag.
