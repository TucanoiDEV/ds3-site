// ============ Troca de abas ============
const abas = document.querySelectorAll(".aba");
const paginas = document.querySelectorAll(".pagina");

function abrirAba(nome) {
  document.body.dataset.aba = nome;

  abas.forEach((aba) => {
    const ativa = aba.dataset.aba === nome;
    aba.classList.toggle("ativa", ativa);
    aba.setAttribute("aria-selected", ativa);
  });

  paginas.forEach((pagina) => {
    pagina.classList.toggle("ativa", pagina.id === nome);
  });

  if (nome === "itens") {
    carregarCatalogo();
    carregarMapa();
  }
  if (nome === "web") carregarPublicacoes();

  history.replaceState(null, "", "#" + nome);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

abas.forEach((aba) => {
  aba.addEventListener("click", () => abrirAba(aba.dataset.aba));
});

// ============ Lore e Desafios: texto completo de cada card ============
// O texto de cada card fica em <template id="historia-..."> no index.html;
// o data-tag do template define o rótulo da janela (padrão: "Lore")
const historia = document.getElementById("historia");

document.querySelectorAll("[data-historia]").forEach((card) => {
  const seta = document.createElement("span");
  seta.className = "seta";
  const modelo = document.getElementById("historia-" + card.dataset.historia);
  seta.textContent = modelo.dataset.tag ? "Ver o guia →" : "Ler a história →";
  card.appendChild(seta);

  const abrir = () => {
    document.getElementById("historia-tag").textContent = modelo.dataset.tag || "Lore";
    document.getElementById("historia-titulo").textContent = card.querySelector("h2, h3").textContent;
    document.getElementById("historia-texto").replaceChildren(modelo.content.cloneNode(true));
    historia.showModal();
    historia.scrollTop = 0;
  };
  card.addEventListener("click", abrir);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      abrir();
    }
  });
});

historia.querySelector(".ficha-fechar").addEventListener("click", () => historia.close());
historia.addEventListener("click", (e) => {
  if (e.target === historia) historia.close();
});

// ============ Catálogo completo de itens ============
// Os dados vêm de public/itens/itens.json (gerado por tools/gerar_itens.py) e só
// são baixados quando a aba Itens é aberta pela primeira vez.
const CATEGORIAS = {
  todos: "Todos",
  arma: "Armas",
  escudo: "Escudos",
  catalisador: "Catalisadores",
  armadura: "Armaduras",
  anel: "Anéis",
  magia: "Magias",
  consumivel: "Consumíveis",
  material: "Materiais",
  municao: "Munição",
  alma: "Almas",
  chave: "Itens-chave",
};
const NOME_SINGULAR = {
  arma: "Arma", escudo: "Escudo", catalisador: "Catalisador", armadura: "Armadura",
  anel: "Anel", magia: "Magia", consumivel: "Consumível", material: "Material",
  municao: "Munição", alma: "Alma", chave: "Item-chave",
};
const POR_VEZ = 60;

const catalogo = document.getElementById("catalogo");
const busca = document.getElementById("busca-itens");
const filtrosCatalogo = document.getElementById("filtros-catalogo");
const contagem = document.getElementById("contagem-itens");
const fimCatalogo = document.getElementById("catalogo-fim");
const ficha = document.getElementById("ficha-item");

let todosItens = [];
let visiveis = [];
let exibidos = 0;
let categoriaAtual = "todos";
let carregamento = null;

function simplificar(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto) el.textContent = texto;
  return el;
}

function carregarCatalogo() {
  carregamento ??= fetch("itens/itens.json")
    .then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then((itens) => {
      // A busca aceita o nome em português ou em inglês, com ou sem acentos
      todosItens = itens.map((item, i) => ({ ...item, id: i, busca: simplificar(`${item.np || ""} ${item.n}`) }));
      montarFiltros();
      aplicarFiltros();
    })
    .catch(() => {
      contagem.textContent = "Não foi possível carregar o catálogo. Rode o site com npm run dev.";
      carregamento = null;
    });
}

function montarFiltros() {
  const total = { todos: todosItens.length };
  todosItens.forEach((i) => (total[i.c] = (total[i.c] || 0) + 1));
  for (const [chave, nome] of Object.entries(CATEGORIAS)) {
    if (!total[chave]) continue;
    const botao = criar("button", "filtro" + (chave === categoriaAtual ? " ativo" : ""), `${nome} (${total[chave]})`);
    botao.type = "button";
    botao.addEventListener("click", () => {
      categoriaAtual = chave;
      filtrosCatalogo.querySelectorAll(".filtro").forEach((b) => b.classList.toggle("ativo", b === botao));
      aplicarFiltros();
    });
    filtrosCatalogo.appendChild(botao);
  }
}

function aplicarFiltros() {
  const termo = simplificar(busca.value.trim());
  visiveis = todosItens.filter(
    (i) => (categoriaAtual === "todos" || i.c === categoriaAtual) && (!termo || i.busca.includes(termo))
  );
  catalogo.replaceChildren();
  exibidos = 0;
  contagem.textContent =
    visiveis.length === 1 ? "1 item encontrado" : `${visiveis.length} itens encontrados`;
  mostrarMais();
}

function mostrarMais() {
  const lote = visiveis.slice(exibidos, exibidos + POR_VEZ);
  const fragmento = document.createDocumentFragment();
  lote.forEach((item) => fragmento.appendChild(cartaoItem(item)));
  catalogo.appendChild(fragmento);
  exibidos += lote.length;
}

function cartaoItem(item) {
  const botao = criar("button", "mini-item");
  botao.type = "button";
  botao.dataset.id = item.id;
  const img = criar("img");
  img.loading = "lazy";
  img.alt = "";
  if (item.i) img.src = "itens/img/" + encodeURIComponent(item.i);
  else img.classList.add("sem-imagem");
  const textos = criar("span", "mini-textos");
  textos.append(criar("span", "mini-nome", item.np || item.n), criar("span", "mini-tipo", item.s || NOME_SINGULAR[item.c]));
  if (item.np && item.np !== item.n) botao.title = item.n;
  botao.append(img, textos);
  return botao;
}

function abrirFicha(item) {
  const img = document.getElementById("ficha-img");
  img.hidden = !item.i;
  if (item.i) img.src = "itens/img/" + encodeURIComponent(item.i);
  document.getElementById("ficha-tag").textContent =
    NOME_SINGULAR[item.c] + (item.s ? " · " + item.s : "");
  document.getElementById("ficha-nome").textContent = item.np || item.n;
  const nomeIngles = document.getElementById("ficha-nome-en");
  nomeIngles.textContent = item.n;
  nomeIngles.hidden = !item.np || item.np === item.n;

  const efeito = document.getElementById("ficha-efeito");
  efeito.textContent = item.ep || item.e || "";
  efeito.hidden = !efeito.textContent;

  const stats = document.getElementById("ficha-stats");
  stats.replaceChildren(
    ...(item.st || []).map(([rotulo, valor]) => {
      const div = criar("div");
      div.append(criar("dt", "", rotulo), criar("dd", "", valor));
      return div;
    })
  );
  stats.hidden = !item.st;

  document.getElementById("ficha-desc").replaceChildren(...(item.dp || item.d || []).map((p) => criar("p", "", p)));

  const onde = document.getElementById("ficha-onde");
  onde.querySelector("ul").replaceChildren(
    ...(item.o || []).map(([nivel, texto]) => {
      const li = criar("li", "", texto);
      li.style.marginLeft = Math.max(0, nivel - 1) + "rem";
      return li;
    })
  );
  onde.hidden = !item.o;
  onde.querySelector("ul").lang = item.oe ? "en" : "pt-BR";
  document.getElementById("ficha-onde-en").hidden = !item.oe;

  // As pedras de Titanita ganham um atalho para o mapa, já filtrado pela pedra
  const linkMapa = document.getElementById("ficha-mapa");
  linkMapa.hidden = !PEDRA_POR_NOME[item.n];
  linkMapa.dataset.pedra = PEDRA_POR_NOME[item.n] || "";

  document.getElementById("ficha-wiki").href =
    "https://darksouls.fandom.com/wiki/" + encodeURIComponent(item.u.replaceAll(" ", "_"));

  ficha.showModal();
  ficha.scrollTop = 0;
}

catalogo.addEventListener("click", (e) => {
  const botao = e.target.closest(".mini-item");
  if (botao) abrirFicha(todosItens[botao.dataset.id]);
});

ficha.querySelector(".ficha-fechar").addEventListener("click", () => ficha.close());
// Clicar fora do conteúdo (no fundo escurecido) fecha a ficha
ficha.addEventListener("click", (e) => {
  if (e.target === ficha) ficha.close();
});

let esperaBusca;
busca.addEventListener("input", () => {
  clearTimeout(esperaBusca);
  esperaBusca = setTimeout(aplicarFiltros, 150);
});

// Rolagem infinita: carrega o próximo lote quando o fim da lista aparece
new IntersectionObserver((entradas) => {
  if (entradas[0].isIntersecting && exibidos < visiveis.length) mostrarMais();
}, { rootMargin: "400px" }).observe(fimCatalogo);

// ============ Mapa da Titanita ============
// Mapa esquemático das áreas, com os locais de cada pedra de reforço. Os dados
// (áreas, ligações e locais em português) ficam em public/itens/titanita.json.
const PEDRA_POR_NOME = {
  "Titanite Shard": "fragmento",
  "Large Titanite Shard": "grande",
  "Titanite Chunk": "pedaco",
  "Titanite Slab": "placa",
  "Twinkling Titanite": "cintilante",
  "Titanite Scale": "escama",
};
const SVG = "http://www.w3.org/2000/svg";
const mapa = document.getElementById("mapa-titanita");
const mapaPainel = document.getElementById("mapa-painel");
const filtrosTitanita = document.getElementById("filtros-titanita");

let dadosMapa = null;
let pedraAtual = "todas";
let areaAtual = null;
let carregamentoMapa = null;

function carregarMapa() {
  carregamentoMapa ??= fetch("itens/titanita.json")
    .then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then((dados) => {
      dadosMapa = dados;
      desenharMapa();
      montarFiltrosTitanita();
      atualizarMapa();
    })
    .catch(() => {
      mapaPainel.textContent = "Não foi possível carregar o mapa da Titanita.";
      carregamentoMapa = null;
    });
}

function elementoSvg(tag, atributos) {
  const el = document.createElementNS(SVG, tag);
  for (const [nome, valor] of Object.entries(atributos)) el.setAttribute(nome, valor);
  return el;
}

function locaisDe(area) {
  return dadosMapa.locais.filter((l) => l.area === area && (pedraAtual === "todas" || l.pedra === pedraAtual));
}

function desenharMapa() {
  const porId = Object.fromEntries(dadosMapa.areas.map((a) => [a.id, a]));
  const ligacoes = elementoSvg("g", { class: "mapa-ligacoes" });
  for (const [de, para] of dadosMapa.ligacoes) {
    const a = porId[de], b = porId[para];
    ligacoes.append(elementoSvg("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
  }
  mapa.append(ligacoes);

  for (const area of dadosMapa.areas) {
    const g = elementoSvg("g", {
      class: "mapa-area" + (area.dlc ? " dlc" : ""),
      tabindex: "0",
      role: "button",
      "data-area": area.id,
    });
    g.append(elementoSvg("rect", { x: area.x - 78, y: area.y - 26, width: 156, height: 52, rx: 4 }));
    const texto = elementoSvg("text", { x: area.x, y: area.y + 5 - (area.rotulo.length - 1) * 8 });
    area.rotulo.forEach((linha, i) => {
      const tspan = elementoSvg("tspan", { x: area.x, dy: i ? 16 : 0 });
      tspan.textContent = linha;
      texto.append(tspan);
    });
    g.append(texto);
    if (area.dlc) {
      const selo = elementoSvg("text", { class: "mapa-selo", x: area.x - 72, y: area.y - 15 });
      selo.textContent = "DLC";
      g.append(selo);
    }
    const contador = elementoSvg("g", { class: "mapa-contador" });
    contador.append(
      elementoSvg("circle", { cx: area.x + 74, cy: area.y - 24, r: 13 }),
      elementoSvg("text", { x: area.x + 74, y: area.y - 19.5 })
    );
    g.append(contador);
    g.addEventListener("click", () => selecionarArea(area.id));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selecionarArea(area.id);
      }
    });
    mapa.append(g);
  }
}

function montarFiltrosTitanita() {
  const opcoes = { todas: "Todas", ...Object.fromEntries(Object.entries(dadosMapa.pedras).map(([k, p]) => [k, p.np])) };
  for (const [chave, nome] of Object.entries(opcoes)) {
    const total = dadosMapa.locais.filter((l) => chave === "todas" || l.pedra === chave).length;
    const botao = criar("button", "filtro" + (chave === pedraAtual ? " ativo" : ""), `${nome} (${total})`);
    botao.type = "button";
    botao.dataset.pedra = chave;
    botao.addEventListener("click", () => selecionarPedra(chave));
    filtrosTitanita.appendChild(botao);
  }
}

function selecionarPedra(chave) {
  pedraAtual = chave;
  filtrosTitanita.querySelectorAll(".filtro").forEach((b) => b.classList.toggle("ativo", b.dataset.pedra === chave));
  atualizarMapa();
}

function selecionarArea(id) {
  areaAtual = areaAtual === id ? null : id;
  atualizarMapa();
}

function atualizarMapa() {
  mapa.querySelectorAll(".mapa-area").forEach((g) => {
    const area = dadosMapa.areas.find((a) => a.id === g.dataset.area);
    const total = locaisDe(area.id).length;
    g.classList.toggle("vazia", total === 0);
    g.classList.toggle("selecionada", area.id === areaAtual);
    g.querySelector(".mapa-contador").style.display = total ? "" : "none";
    g.querySelector(".mapa-contador text").textContent = total;
    g.setAttribute("aria-label", `${area.nome}: ${total === 1 ? "1 local" : total + " locais"}`);
    g.setAttribute("aria-pressed", area.id === areaAtual);
  });
  montarPainel();
}

function montarPainel() {
  const pedras = dadosMapa.pedras;
  const chaves = pedraAtual === "todas" ? Object.keys(pedras) : [pedraAtual];

  if (!areaAtual) {
    // Sem área escolhida: legenda com o uso de cada pedra
    const titulo = criar("h3", "mapa-painel-titulo", "Clique numa área do mapa");
    const lista = criar("ul", "mapa-legenda");
    for (const k of chaves) {
      const li = criar("li");
      li.append(iconePedra(pedras[k]), criar("strong", "", pedras[k].np), ` — ${pedras[k].uso}`);
      lista.append(li);
    }
    mapaPainel.replaceChildren(titulo, lista);
    return;
  }

  const area = dadosMapa.areas.find((a) => a.id === areaAtual);
  const titulo = criar("h3", "mapa-painel-titulo", area.nome);
  if (area.dlc) titulo.append(" ", criar("span", "selo-dlc", "DLC"));
  const blocos = [];
  for (const k of chaves) {
    const locais = dadosMapa.locais.filter((l) => l.area === areaAtual && l.pedra === k);
    if (!locais.length) continue;
    const cabecalho = criar("h4", "mapa-pedra");
    cabecalho.append(iconePedra(pedras[k]), pedras[k].np, criar("small", "", ` · ${pedras[k].uso}`));
    const lista = criar("ul", "locais");
    for (const local of locais) {
      const li = criar("li", "", local.t);
      if (local.sub) {
        const sub = criar("ul");
        local.sub.forEach((s) => sub.append(criar("li", "", s)));
        li.append(sub);
      }
      lista.append(li);
    }
    blocos.push(cabecalho, lista);
  }
  if (!blocos.length) {
    const nome = pedraAtual === "todas" ? "Titanita" : pedras[pedraAtual].np;
    blocos.push(criar("p", "mapa-vazio", `Não há ${nome} nesta área.`));
  }
  mapaPainel.replaceChildren(titulo, ...blocos);
}

function iconePedra(pedra) {
  const img = criar("img", "mapa-icone");
  img.src = "itens/img/" + pedra.i;
  img.alt = "";
  return img;
}

// Atalho da ficha de uma pedra: fecha a ficha e mostra o mapa filtrado
document.getElementById("ficha-mapa").addEventListener("click", (e) => {
  e.preventDefault();
  ficha.close();
  if (dadosMapa) selecionarPedra(e.currentTarget.dataset.pedra);
  else pedraAtual = e.currentTarget.dataset.pedra;
  document.getElementById("mapa-titanita-titulo").scrollIntoView({ behavior: "smooth" });
});

// ============ Conteúdos da Web: publicações recentes ============
// public/web/conteudos.json é regerado a cada poucas horas pelo GitHub Actions
// (tools/gerar_web.py), então esta lista acompanha as novidades sozinha.
const FONTES = { steam: "Steam", youtube: "YouTube", reddit: "Reddit", speedrun: "Speedrun" };
const publicacoes = document.getElementById("publicacoes");
const publicacoesInfo = document.getElementById("publicacoes-info");
const relativo = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
let carregamentoWeb = null;

function tempoAtras(iso) {
  const segundos = (new Date(iso) - Date.now()) / 1000;
  const unidades = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unidade, tamanho] of unidades) {
    if (Math.abs(segundos) >= tamanho) return relativo.format(Math.round(segundos / tamanho), unidade);
  }
  return "agora mesmo";
}

function carregarPublicacoes() {
  carregamentoWeb ??= fetch("web/conteudos.json", { cache: "no-cache" })
    .then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(({ atualizado, itens }) => {
      publicacoesInfo.textContent = `Atualizado ${tempoAtras(atualizado)}.`;
      // O card "Notícias da Steam" mostra a notícia mais recente
      const noticia = itens.find((i) => i.f === "steam");
      const recente = document.getElementById("recente-steam");
      if (noticia) {
        recente.replaceChildren(criar("span", "", "Mais recente: "), criar("strong", "", noticia.t), ` · ${tempoAtras(noticia.d)}`);
        recente.hidden = false;
      }
      publicacoes.replaceChildren(
        ...itens.map((item) => {
          const link = criar("a", "publicacao");
          link.href = item.u;
          link.target = "_blank";
          link.rel = "noopener";
          link.lang = "en";
          const textos = criar("span", "publicacao-textos");
          textos.append(criar("span", "publicacao-titulo", item.t));
          if (item.r) textos.append(criar("span", "publicacao-resumo", item.r));
          const data = criar("time", "publicacao-meta", [item.a, tempoAtras(item.d)].filter(Boolean).join(" · "));
          data.dateTime = item.d;
          data.lang = "pt-BR";
          textos.append(data);
          link.append(criar("span", "tag", FONTES[item.f] || item.f), textos);
          const li = criar("li");
          li.append(link);
          return li;
        })
      );
    })
    .catch(() => {
      publicacoesInfo.textContent = "Não foi possível carregar as publicações recentes.";
      carregamentoWeb = null;
    });
}

// ============ Brasas flutuando ============
const brasas = document.getElementById("brasas");

for (let i = 0; i < 35; i++) {
  const brasa = document.createElement("span");
  brasa.className = "brasa";
  const tamanho = 2 + Math.random() * 4;
  brasa.style.left = Math.random() * 100 + "%";
  brasa.style.width = tamanho + "px";
  brasa.style.height = tamanho + "px";
  brasa.style.animationDuration = 8 + Math.random() * 12 + "s";
  brasa.style.animationDelay = -Math.random() * 20 + "s";
  brasa.style.setProperty("--desvio", (Math.random() - 0.5) * 200 + "px");
  brasas.appendChild(brasa);
}

// Abre a aba indicada na URL (ex.: index.html#itens). Fica no fim para que
// tudo o que abrirAba usa (como o catálogo) já esteja definido.
const inicial = location.hash.slice(1);
if (document.getElementById(inicial)?.classList.contains("pagina")) {
  abrirAba(inicial);
  // O navegador também rola até o elemento do #, o que esconde o título atrás do
  // cabeçalho fixo. Depois que a página carrega, volta ao topo.
  addEventListener("load", () => window.scrollTo({ top: 0, behavior: "instant" }));
}
