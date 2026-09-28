"""Acesso à API da Dark Souls Wiki (Fandom), com cache local para não repetir requisições."""
import hashlib, json, os, time, urllib.parse, urllib.request

API = "https://darksouls.fandom.com/api.php"
UA = "ds3-site/1.0 (fan project, personal use)"
CACHE = os.path.join(os.path.dirname(__file__), ".cache")
os.makedirs(CACHE, exist_ok=True)


def api(**params):
    params = {"format": "json", "formatversion": "2", **params}
    url = API + "?" + urllib.parse.urlencode(params)
    arquivo = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + ".json")
    if os.path.exists(arquivo):
        with open(arquivo, encoding="utf-8") as f:
            return json.load(f)
    for tentativa in range(8):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                dados = json.load(r)
            break
        except Exception:
            if tentativa == 7:
                raise
            time.sleep(5 * (tentativa + 1))
    time.sleep(0.3)  # educação com o servidor
    with open(arquivo, "w", encoding="utf-8") as f:
        json.dump(dados, f)
    return dados


def membros(categoria):
    """Títulos (namespace principal) de uma categoria."""
    titulos, cont = [], {}
    while True:
        d = api(action="query", list="categorymembers", cmtitle="Category:" + categoria,
                cmnamespace=0, cmlimit=500, **cont)
        titulos += [m["title"] for m in d["query"]["categorymembers"]]
        if "continue" not in d:
            return titulos
        cont = {"cmcontinue": d["continue"]["cmcontinue"]}


def conteudos(titulos):
    """{titulo: wikitext}, seguindo redirecionamentos, em lotes de 50."""
    saida = {}
    for i in range(0, len(titulos), 50):
        lote = titulos[i:i + 50]
        d = api(action="query", prop="revisions", rvprop="content", rvslots="main",
                redirects=1, titles="|".join(lote))
        mapa = {t: t for t in lote}
        for r in d["query"].get("normalized", []) + d["query"].get("redirects", []):
            for orig, dest in list(mapa.items()):
                if dest == r["from"]:
                    mapa[orig] = r["to"]
        paginas = {p["title"]: p for p in d["query"]["pages"]}
        for orig, dest in mapa.items():
            p = paginas.get(dest)
            if p and "revisions" in p:
                saida[orig] = (dest, p["revisions"][0]["slots"]["main"]["content"])
    return saida


def imagens(arquivos, largura=128):
    """{nome_arquivo: url_miniatura}, em lotes de 50."""
    saida = {}
    arquivos = sorted(set(arquivos))
    for i in range(0, len(arquivos), 50):
        lote = ["File:" + a for a in arquivos[i:i + 50]]
        d = api(action="query", prop="imageinfo", iiprop="url", iiurlwidth=largura,
                redirects=1, titles="|".join(lote))
        mapa = {t: t for t in lote}
        for r in d["query"].get("normalized", []) + d["query"].get("redirects", []):
            for orig, dest in list(mapa.items()):
                if dest == r["from"]:
                    mapa[orig] = r["to"]
        paginas = {p["title"]: p for p in d["query"]["pages"]}
        for orig, dest in mapa.items():
            p = paginas.get(dest)
            if p and p.get("imageinfo"):
                info = p["imageinfo"][0]
                saida[orig[5:]] = info.get("thumburl") or info["url"]
    return saida
