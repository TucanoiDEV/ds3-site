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

  if (nome === "itens") carregarCatalogo();
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
}
