# TETROK

Jogo de puzzle com peças que caem. É **original**: nomes, cores, textos e sons próprios, em português do Brasil. Dá para jogar no celular (toque) e no computador (teclado), no mesmo endereço.

**Jogar online:** [https://kt3746.github.io/grokbot-tetrok/](https://kt3746.github.io/grokbot-tetrok/)

> Se o link ainda não abrir, veja [Publicar no GitHub Pages](#publicar-no-github-pages) no final deste arquivo.

## Como jogar

1. Peças de quatro blocos caem no poço.
2. Mova, gire e encaixe para **completar linhas horizontais**.
3. Linha cheia some e você ganha pontos. Quatro de uma vez é **TETROK** — vale mais.
4. A cada 10 linhas o **nível** sobe e as peças caem mais rápido.
5. Se a pilha chega no topo e a próxima peça não cabe, a partida acaba.
6. A sombra clara mostra onde a peça vai pousar.
7. **Reserva** guarda uma peça para usar depois (uma vez por peça).

### Peças (nomes originais)

| Nome | Formato |
| --- | --- |
| Viga | barra reta |
| Quadro | quadrado |
| Âncora | três em linha com um no meio |
| Onda | degrau para a direita |
| Raio | degrau para a esquerda |
| Gancho | canto com a “cabeça” à esquerda |
| Cotovelo | canto com a “cabeça” à direita |

## Controles

### Computador

| Tecla | Ação |
| --- | --- |
| `←` `→` ou `A` `D` | Mover |
| `↓` ou `S` | Queda suave (acelera e ganha 1 ponto por casa) |
| `↑` ou `X` | Girar |
| `Z` | Girar para o outro lado |
| `Espaço` | Queda rápida |
| `C` | Reservar |
| `P` ou `Esc` | Pausar |

### Celular

Na primeira visita aparece **Como jogar** (passos curtos, dá para pular). O jeito ensinado é só pelos **botões**:

| Botão | Ação |
| --- | --- |
| `◀` `▶` | Mover (mesma fileira, grandes) |
| **Girar** | Virar a peça |
| **▼ suave** | Desce um pouco |
| **Queda!** | Queda rápida (ação principal) |

**Reserva** (o ＋ no canto) guarda a peça para usar depois — o tutorial explica isso. **Próxima** fica na mesma faixa estreita, para o poço ficar grande.

O primeiro toque também liga o som (o navegador exige um gesto seu).

## Som e recorde

- Botão **Som** silencia ou ativa. A escolha fica salva neste aparelho.
- Os efeitos são tons criados no navegador (Web Audio), sem músicas prontas.
- O recorde da tela final fica salvo no próprio navegador.

## Jogar neste computador

Não precisa instalar nada além de um navegador.

```bash
python3 -m http.server 4173
```

Abra [http://localhost:4173](http://localhost:4173).

Para checar a lógica do jogo:

```bash
npm test
```

## Publicar no GitHub Pages

O fluxo em `.github/workflows/pages.yml` publica a pasta do site sempre que alguém envia código para a branch `main`.

**Uma vez no GitHub** (dono do repositório), se o site ainda não abrir:

1. Abra o repositório → **Settings** → **Pages**.
2. Em **Build and deployment → Source**, escolha **GitHub Actions**.
3. O fluxo em `.github/workflows/pages.yml` publica sozinho a cada push na `main`.
4. O endereço esperado é: `https://kt3746.github.io/grokbot-tetrok/`

Cada publicação troca o parâmetro `?v=` dos arquivos (hash do commit), para o navegador não ficar com uma versão velha.

## Arquivos

- `index.html` — tela, textos e importmap do Three.js (vendor local)
- `css/styles.css` — visual, HUD, overlays
- `js/engine.js` — regras (pontos, linhas, reserva, fim de jogo)
- `js/pieces.js` — formas e cores
- `js/render.js` — desenho Canvas 2D (também usado se WebGL falhar)
- `js/render3d.js` — poço 3D em Three.js (baixo-poli)
- `js/renderer.js` — escolhe 3D ou 2D automaticamente
- `js/vendor/three.module.js` — Three.js local (sem CDN)
- `js/input.js` — teclado e toque
- `js/audio.js` — sons
- `js/skins.js` — paletas Neon / Magma / CRT / Pixel
- `js/main.js` — liga tudo

O visual 3D usa o mesmo motor de regras. Se o aparelho não tiver WebGL, aparece um aviso em português e o jogo segue no canvas clássico.

Feito para ser leve, estático e rápido — sem servidor próprio.
