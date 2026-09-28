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

  history.replaceState(null, "", "#" + nome);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

abas.forEach((aba) => {
  aba.addEventListener("click", () => abrirAba(aba.dataset.aba));
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
