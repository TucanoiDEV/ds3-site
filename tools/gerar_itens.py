"""Gera public/itens/itens.json e as miniaturas em public/itens/img/ a partir da
Dark Souls Wiki (Fandom), cujo texto é licenciado sob CC BY-SA. Nomes e descrições
em português vêm dos textos oficiais do jogo (ver textos_oficiais).

Uso:  python tools/gerar_itens.py
As respostas da API ficam em tools/.cache; apague a pasta para buscar tudo de novo.
"""
import html, json, os, re, shutil, subprocess, sys, time
from fandom import UA, conteudos, imagens, membros

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, "public", "itens")
PASTA_IMG = os.path.join(SAIDA, "img")

# Categoria do Fandom -> categoria do site. A ordem define a prioridade quando
# uma página está em mais de uma categoria (ex.: escudos também são "Weapons").
CATEGORIAS = [
    ("Dark Souls III: Shields", "escudo"),
    ("Dark Souls III: Casting Tools", "catalisador"),
    ("Dark Souls III: Weapons", "arma"),
    ("Dark Souls III: Head Armor", "armadura"),
    ("Dark Souls III: Chest Armor", "armadura"),
    ("Dark Souls III: Hands Armor", "armadura"),
    ("Dark Souls III: Legs Armor", "armadura"),
    ("Dark Souls III: Rings", "anel"),
    ("Dark Souls III: Sorceries", "magia"),
    ("Dark Souls III: Miracles", "magia"),
    ("Dark Souls III: Pyromancies", "magia"),
    ("Dark Souls III: Ammunition", "municao"),
    ("Dark Souls III: Upgrade Materials", "material"),
    ("Dark Souls III: Boss Souls", "alma"),
    ("Dark Souls III: Souls", "alma"),
    ("Dark Souls III: Key Items", "chave"),
    ("Dark Souls III: Coals", "chave"),
    ("Dark Souls III: Spell Catalogues", "chave"),
    ("Dark Souls III: Umbral Ashes", "chave"),
    ("Dark Souls III: Items", "consumivel"),
    ("Dark Souls III: Miscellaneous Items", "consumivel"),
    ("Dark Souls III: Online Play Items", "consumivel"),
]
ORDEM = ["arma", "escudo", "catalisador", "armadura", "anel", "magia", "consumivel",
         "material", "municao", "alma", "chave"]

PARTES_ARMADURA = {
    "Dark Souls III: Head Armor": "Cabeça",
    "Dark Souls III: Chest Armor": "Tronco",
    "Dark Souls III: Hands Armor": "Mãos",
    "Dark Souls III: Legs Armor": "Pernas",
}

TIPOS = {
    "Dagger": "Adaga", "Straight Sword": "Espada Reta", "Greatsword": "Grande Espada",
    "Ultra Greatsword": "Ultra Grande Espada", "Curved Sword": "Espada Curva",
    "Curved Greatsword": "Grande Espada Curva", "Katana": "Katana",
    "Thrusting Sword": "Espada de Estocada", "Axe": "Machado", "Greataxe": "Grande Machado",
    "Hammer": "Martelo", "Great Hammer": "Grande Martelo", "Fist": "Punho", "Claw": "Garra",
    "Spear": "Lança", "Pike": "Pique", "Halberd": "Alabarda", "Reaper": "Ceifadora",
    "Whip": "Chicote", "Bow": "Arco", "Greatbow": "Grande Arco", "Crossbow": "Besta",
    "Staff": "Cajado", "Talisman": "Talismã", "Sacred Chime": "Sino Sagrado",
    "Pyromancy Flame": "Chama de Piromancia", "Small Shield": "Escudo Pequeno",
    "Shield": "Escudo Médio", "Medium Shield": "Escudo Médio", "Greatshield": "Grande Escudo",
    "Torch": "Tocha", "Sorcery": "Feitiçaria", "Miracle": "Milagre", "Pyromancy": "Piromancia",
    "Arrow": "Flecha", "Bolt": "Virote", "Great Arrow": "Grande Flecha",
    "Dark Sorcery": "Feitiçaria Sombria", "Dark Miracle": "Milagre Sombrio",
    "Dark Pyromancy": "Piromancia Sombria",
}
SUFIXOS = {"paired": "dupla", "unique": "única"}


# ---------------- Limpeza de wikitext ----------------

def sem_templates(texto):
    """Remove {{...}} (com aninhamento)."""
    saida, nivel, i = [], 0, 0
    while i < len(texto):
        if texto.startswith("{{", i):
            nivel += 1; i += 2; continue
        if texto.startswith("}}", i) and nivel:
            nivel -= 1; i += 2; continue
        if not nivel:
            saida.append(texto[i])
        i += 1
    return "".join(saida)


def limpar(texto, quebras=False):
    texto = re.sub(r"<!--.*?-->", "", texto, flags=re.S)
    texto = re.sub(r"<ref[^>/]*/>|<ref[^>]*>.*?</ref>", "", texto, flags=re.S)
    texto = re.sub(r"<br\s*/?>", "\n" if quebras else " ", texto)
    texto = sem_templates(texto)
    texto = re.sub(r"\[\[(?:File|Image|Category):[^\]]*\]\]", "", texto, flags=re.I)
    texto = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", texto)
    texto = re.sub(r"\[\[([^\]]*)\]\]", r"\1", texto)
    texto = re.sub(r"\[https?://\S+ ([^\]]*)\]", r"\1", texto)
    texto = re.sub(r"'{2,}", "", texto)
    texto = re.sub(r"<[^>]+>", "", texto)
    texto = html.unescape(texto)
    texto = re.sub("[​-‏﻿]", "", texto)  # marcas invisíveis (ex.: "Prisoner's Chain.png‎")
    texto = re.sub(r"[ \t]+", " ", texto)
    return re.sub(r" *\n *", "\n", texto).strip()


def bloco(texto, nome):
    """Conteúdo do primeiro {{nome ...}}, respeitando chaves aninhadas."""
    m = re.search(r"\{\{\s*" + nome + r"\s*\|", texto)
    if not m:
        return None
    nivel, i = 1, m.end()
    while i < len(texto) and nivel:
        if texto.startswith("{{", i):
            nivel += 1; i += 2
        elif texto.startswith("}}", i):
            nivel -= 1; i += 2
        else:
            i += 1
    return texto[m.end():i - 2]


def campos(conteudo):
    """Divide 'a = 1 | b = [[x|y]]' em {'a': '1', 'b': '[[x|y]]'}."""
    partes, atual, nivel = [], [], 0
    i = 0
    while i < len(conteudo):
        dois = conteudo[i:i + 2]
        if dois in ("{{", "[["):
            nivel += 1; atual.append(dois); i += 2; continue
        if dois in ("}}", "]]"):
            nivel -= 1; atual.append(dois); i += 2; continue
        if conteudo[i] == "|" and nivel == 0:
            partes.append("".join(atual)); atual = []
        else:
            atual.append(conteudo[i])
        i += 1
    partes.append("".join(atual))
    saida = {}
    for p in partes:
        if "=" in p:
            k, v = p.split("=", 1)
            saida[k.strip()] = v.strip()
    return saida


def secao(texto, titulo):
    m = re.search(r"^==\s*" + titulo + r"\s*==\s*$", texto, flags=re.M | re.I)
    if not m:
        return ""
    fim = re.search(r"^==[^=].*==\s*$", texto[m.end():], flags=re.M)
    return texto[m.end(): m.end() + fim.start() if fim else len(texto)]


def onde_encontrar(texto, limite=8):
    """Linhas da seção Availability como [profundidade, texto]."""
    linhas = []
    for bruta in secao(texto, "Availability").splitlines():
        m = re.match(r"^(\*+|:+)?\s*(.*)$", bruta.strip())
        prof = len(m.group(1)) if m.group(1) else 0
        t = limpar(m.group(2))
        interlingua = re.match(r"^[a-z]{2,3}(-[a-z]+)?:", t)  # ex.: "pl:Hełm Alvy"
        if t and not interlingua and not t.startswith("{|") and not t.startswith("|"):
            linhas.append([prof, t])
    if len(linhas) > limite:
        linhas = linhas[:limite] + [[0, "…"]]
    return linhas


# ---------------- Montagem de cada item ----------------

def num(v):
    v = limpar(v or "")
    return v if v not in ("", "-", "0", "0.0", "N/A", "?") else None


def tipo_pt(v):
    v = limpar(v or "")
    sufixo = re.search(r"\s*\((\w+)\)$", v)  # ex.: "Katana (paired)"
    if sufixo:
        v = v[:sufixo.start()]
    v = v[:1].upper() + v[1:]
    base = TIPOS.get(v, TIPOS.get(v.rstrip("s"), v)) or None
    if base and sufixo:
        base += " (" + SUFIXOS.get(sufixo.group(1).lower(), sufixo.group(1)) + ")"
    return base


def stats_arma(f):
    st = []
    tipo = tipo_pt(f.get("weapon-type"))
    dano = [f"{num(f.get(k))} {r}" for k, r in
            [("phys-atk", "fís"), ("mag-atk", "mag"), ("fire-atk", "fogo"),
             ("ltn-atk", "raio"), ("dark-atk", "trevas")] if num(f.get(k))]
    if dano:
        st.append(["Dano", " · ".join(dano)])
    if num(f.get("atk-type")):
        st.append(["Tipo de ataque", limpar(f["atk-type"])])
    req = [f"{num(f.get(k))} {r}" for k, r in
           [("str-req", "FOR"), ("dex-req", "DES"), ("int-req", "INT"), ("fth-req", "FÉ")] if num(f.get(k))]
    st.append(["Requisitos", " · ".join(req) or "Nenhum"])
    esc = [f"{r} {limpar(f[k])}" for k, r in
           [("str-bonus", "FOR"), ("dex-bonus", "DES"), ("int-bonus", "INT"), ("fth-bonus", "FÉ")]
           if limpar(f.get(k, "")) not in ("", "-")]
    if esc:
        st.append(["Escalonamento", " · ".join(esc)])
    status = [f"{r} {num(f.get(k))}" for k, r in
              [("bld-atk", "Sangramento"), ("psn-atk", "Veneno"), ("fst-atk", "Congelamento")] if num(f.get(k))]
    if status:
        st.append(["Acúmulo", " · ".join(status)])
    if num(f.get("cast-bonus")):
        st.append(["Bônus mágico", num(f["cast-bonus"])])
    if num(f.get("spc-atk")):
        st.append(["Habilidade", limpar(f["spc-atk"])])
    if num(f.get("stability")):
        st.append(["Estabilidade", num(f["stability"])])
    if num(f.get("weight")):
        st.append(["Peso", num(f["weight"])])
    return tipo, st


def stats_armadura(f):
    st = []
    defesa = [f"{num(f.get(k))} {r}" for k, r in
              [("phys-def", "fís"), ("mag-def", "mag"), ("fire-def", "fogo"),
               ("ltn-def", "raio"), ("dark-def", "trevas")] if num(f.get(k))]
    if defesa:
        st.append(["Defesa", " · ".join(defesa)])
    for k, r in [("poise", "Equilíbrio"), ("weight", "Peso"), ("durability", "Durabilidade")]:
        if num(f.get(k)):
            st.append([r, num(f[k])])
    return st


def stats_magia(f):
    st = []
    for k, r in [("slots", "Espaços"), ("cost", "Custo de PF"), ("int-req", "INT"), ("fth-req", "FÉ")]:
        if num(f.get(k)):
            st.append([r, num(f[k])])
    return tipo_pt(f.get("magic-type")), st


def montar(titulo, destino, texto, categorias):
    cat = next(c for fandom, c in CATEGORIAS if fandom in categorias)
    tpl = re.search(r"\{\{\s*(DaSIII(?:Weapon|Armor|Ring|Magic|Item))\s*\|", texto)
    if not tpl:
        return None  # páginas-índice (listas de tipos de arma etc.)
    f = campos(bloco(texto, tpl.group(1)))
    desc_campos = campos(bloco(texto, "Description") or "")
    descricao = [limpar(v, quebras=True) for k, v in desc_campos.items()
                 if "paragraph" in k.lower() and limpar(v)]

    item = {"n": limpar(f.get("name") or destino.replace(" (Dark Souls III)", "")),
            "c": cat, "u": destino}
    tipo, st, efeito = None, [], None
    nome_tpl = tpl.group(1)
    if nome_tpl == "DaSIIIWeapon":
        tipo, st = stats_arma(f)
    elif nome_tpl == "DaSIIIArmor":
        tipo = next((p for fandom, p in PARTES_ARMADURA.items() if fandom in categorias), None)
        st = stats_armadura(f)
    elif nome_tpl == "DaSIIIRing":
        efeito = limpar(f.get("effect", "")) or None
        if num(f.get("weight")):
            st.append(["Peso", num(f["weight"])])
    elif nome_tpl == "DaSIIIMagic":
        tipo, st = stats_magia(f)
    else:
        efeito = limpar(f.get("usage", "")) or None
        if num(f.get("held-cap")):
            st.append(["Máx. no inventário", num(f["held-cap"])])
    # A wiki nem sempre põe escudos na categoria certa: o tipo da arma decide.
    if cat in ("arma", "escudo") and tipo:
        cat = item["c"] = "escudo" if "Escudo" in tipo else "arma"
    if cat == "municao":
        nome = item["n"].lower()
        tipo = "Grande Flecha" if "greatarrow" in nome else "Virote" if "bolt" in nome else "Flecha"
    if tipo:
        item["s"] = tipo
    if efeito:
        item["e"] = efeito
    if descricao:
        item["d"] = descricao
    if st:
        item["st"] = st
    onde = onde_encontrar(texto)
    if onde:
        item["o"] = onde
    img = limpar(f.get("image", "")).removeprefix("File:").strip()
    if img:
        item["_img"] = img
    return item


def slug(texto):
    texto = re.sub(r"\(Dark Souls III\)", "", texto)
    return re.sub(r"[^a-z0-9]+", "-", texto.lower()).strip("-")


# O CDN de imagens do Fandom recusa (403) o urllib do Python e o curl.exe do Windows
# (TLS schannel), mas aceita o curl com OpenSSL, como o que vem com o Git. No Windows o
# subprocess procura no System32 antes do PATH, então o caminho completo é necessário.
CURL = shutil.which("curl") or "curl"


FORMATOS = [(b"RIFF", ".webp"), (b"\x89PNG", ".png"), (b"\xff\xd8", ".jpg"), (b"GIF8", ".gif")]


def extensao(caminho):
    """Extensão pelo conteúdo: o CDN costuma entregar WebP mesmo quando o original é PNG."""
    with open(caminho, "rb") as f:
        inicio = f.read(4)
    return next((ext for assinatura, ext in FORMATOS if inicio.startswith(assinatura)), ".png")


def baixar(url, base):
    """Baixa a imagem para base + extensão real e devolve o nome do arquivo (ou None)."""
    pasta, nome = os.path.split(base)
    existente = next((f for f in os.listdir(pasta) if os.path.splitext(f)[0] == nome), None)
    if existente:
        return existente
    temp = base + ".part"
    # Se vier 403 (excesso de requisições), espera cada vez mais e tenta de novo.
    for espera in (15, 30, 60, 120, None):
        r = subprocess.run([CURL, "-sSfL", "--retry", "3", "--retry-delay", "3", "-m", "60",
                            "-A", UA, "-o", temp, url], capture_output=True, text=True)
        if r.returncode == 0:
            final = base + extensao(temp)
            os.replace(temp, final)
            time.sleep(0.3)
            return os.path.basename(final)
        if os.path.exists(temp):
            os.remove(temp)
        if espera is None or "403" not in r.stderr:
            print("  falhou:", url, r.stderr.strip(), file=sys.stderr)
            return None
        print(f"  CDN bloqueou (403); aguardando {espera}s…")
        time.sleep(espera)


# ---------------- Textos oficiais em português ----------------
# Nomes e descrições do próprio jogo (localização PT-BR da FromSoftware), extraídos
# dos arquivos do DS3 pelo projeto DarkSouls3.TextViewer.
URL_TEXTOS = "https://raw.githubusercontent.com/mrexodia/DarkSouls3.TextViewer/master/ds3.json"
CATEGORIA_JOGO = {"arma": "weapon", "escudo": "weapon", "catalisador": "weapon",
                  "armadura": "armor", "anel": "accessory", "magia": "magic"}
# Nome na wiki -> nome no jogo, quando diferem
APELIDOS = {
    "Winged Knight Twinaxess": "Winged Knight Twinaxes",
    "Red and White Shield": "Red and White Round Shield",
    "Sellsword Gauntlets": "Sellsword Gauntlet",
    "Undead Legion Gauntlets": "Undead Legion Gauntlet",
    "Herald Leggings": "Herald Trousers",
    "Pestilent Mist": "Pestilent Mercury",
}


def chave(nome):
    return re.sub(r"[^a-z0-9+]", "", nome.lower().replace("’", "'"))


def textos_oficiais():
    """{categoria_do_jogo: {chave_do_nome_em_inglês: entrada_em_português}}"""
    caminho = os.path.join(os.path.dirname(__file__), ".cache", "ds3.json")
    if not os.path.exists(caminho):
        print("Baixando textos oficiais do jogo…")
        subprocess.run([CURL, "-sSfL", "-o", caminho, URL_TEXTOS], check=True)
    with open(caminho, encoding="utf-8") as f:
        idiomas = json.load(f)["languages"]
    indice = {}
    for cat in ("weapon", "armor", "accessory", "magic", "item"):
        pt = idiomas["porBR"][cat]
        for id_, en in idiomas["engUS"][cat].items():
            # Há entradas antigas (restos do DS1) sem tradução: só vale o que tem PT
            if en.get("name") and pt.get(id_, {}).get("name"):
                indice.setdefault(cat, {}).setdefault(chave(en["name"]), pt[id_])
    return indice


def traduzir(itens):
    indice = textos_oficiais()
    sem_traducao = []
    for item in itens:
        k = chave(APELIDOS.get(item["n"], item["n"]))
        preferida = CATEGORIA_JOGO.get(item["c"], "item")
        pt = indice[preferida].get(k) or next((c[k] for c in indice.values() if k in c), None)
        if not pt:
            sem_traducao.append(item["n"])
            continue
        item["np"] = re.sub(r"\s*\n\s*", " ", pt["name"]).strip()
        if pt.get("description", "").strip():
            item["ep"] = re.sub(r"\s*\n\s*", " ", pt["description"]).strip()
        paragrafos = [p.strip() for p in pt.get("knowledge", "").split("\n\n") if p.strip()]
        if paragrafos:
            item["dp"] = paragrafos
            item.pop("d", None)  # a descrição em inglês só serve de reserva
    print(f"Tradução oficial encontrada para {len(itens) - len(sem_traducao)} itens.")
    if sem_traducao:
        print("  sem tradução:", ", ".join(sem_traducao))


def main():
    os.makedirs(PASTA_IMG, exist_ok=True)

    print("Listando categorias…")
    paginas = {}
    for categoria, _ in CATEGORIAS:
        for titulo in membros(categoria):
            paginas.setdefault(titulo, set()).add(categoria)

    print(f"Baixando {len(paginas)} páginas…")
    textos = conteudos(list(paginas))

    itens, vistos = [], set()
    for titulo, (destino, texto) in textos.items():
        if destino in vistos:
            continue
        item = montar(titulo, destino, texto, paginas[titulo])
        if item:
            vistos.add(destino)
            itens.append(item)

    print(f"Buscando {len(itens)} imagens…")
    urls = imagens([i["_img"] for i in itens if "_img" in i])
    baixaveis = []
    for item in itens:
        arquivo = item.pop("_img", None)
        if urls.get(arquivo):
            baixaveis.append((item, urls[arquivo]))

    for n, (item, url) in enumerate(baixaveis, 1):
        nome = baixar(url, os.path.join(PASTA_IMG, slug(item["u"])))
        if nome:
            item["i"] = nome
        if n % 100 == 0:
            print(f"  {n}/{len(baixaveis)}")

    traduzir(itens)

    itens.sort(key=lambda i: (ORDEM.index(i["c"]), i.get("s") or "", (i.get("np") or i["n"]).lower()))
    with open(os.path.join(SAIDA, "itens.json"), "w", encoding="utf-8") as f:
        json.dump(itens, f, ensure_ascii=False, separators=(",", ":"))

    from collections import Counter
    print(f"{len(itens)} itens salvos em public/itens/itens.json")
    print(dict(Counter(i["c"] for i in itens)))
    print("sem imagem:", sum(1 for i in itens if "i" not in i))


if __name__ == "__main__":
    main()
