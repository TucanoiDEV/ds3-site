"""Gera public/web/conteudos.json com as publicações mais recentes sobre Dark Souls III
(notícias da Steam, vídeos do VaatiVidya, posts do r/darksouls3 e speedruns verificados).

Uso:  python tools/gerar_web.py
Roda sozinho pelo GitHub Actions (.github/workflows/site.yml). Se uma fonte falhar,
as publicações dela do arquivo anterior são mantidas.
"""
import html, json, os, re, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, "public", "web", "conteudos.json")
UA = "ds3-site/1.0 (fan project; +https://github.com/TucanoiDEV/ds3-site)"
ATOM = {"a": "http://www.w3.org/2005/Atom"}

STEAM_APP = 374320
CANAL_VAATI = "UCe0DNp0mKMqrYVaTundyr9w"
SPEEDRUN_JOGO = "k6qg0xdg"  # "ds3" no speedrun.com é Dead Space 3


def baixar(url):
    for tentativa in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception:
            if tentativa == 2:
                raise
            time.sleep(10 * (tentativa + 1))


def data_iso(valor):
    """Epoch (int) ou texto ISO 8601 -> ISO em UTC."""
    if isinstance(valor, (int, float)):
        d = datetime.fromtimestamp(valor, timezone.utc)
    else:
        d = datetime.fromisoformat(valor.replace("Z", "+00:00")).astimezone(timezone.utc)
    return d.strftime("%Y-%m-%dT%H:%M:%SZ")


def resumo(texto, limite=180):
    texto = re.sub(r"\[/?[a-z0-9*]+[^\]]*\]", " ", texto)  # BBCode da Steam
    texto = html.unescape(re.sub(r"<[^>]+>", " ", texto))
    texto = re.sub(r"\s+", " ", texto).strip()
    return texto if len(texto) <= limite else texto[:limite].rsplit(" ", 1)[0] + "…"


def duracao(segundos):
    h, resto = divmod(int(round(segundos)), 3600)
    m, s = divmod(resto, 60)
    return f"{h}h {m:02d}min {s:02d}s" if h else f"{m}min {s:02d}s"


# ---------------- Fontes ----------------

def steam():
    url = (f"https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/"
           f"?appid={STEAM_APP}&count=5&maxlength=600")
    for n in json.loads(baixar(url))["appnews"]["newsitems"]:
        yield {"f": "steam", "t": n["title"], "u": urllib.parse.quote(n["url"], safe=":/?&=#%"),
               "d": data_iso(n["date"]), "a": n.get("feedlabel") or n.get("author"),
               "r": resumo(n["contents"])}


def youtube():
    """Só os vídeos sobre Dark Souls (o canal também fala de Elden Ring, Bloodborne...)."""
    raiz = ET.fromstring(baixar(f"https://www.youtube.com/feeds/videos.xml?channel_id={CANAL_VAATI}"))
    for e in raiz.findall("a:entry", ATOM):
        if not re.search(r"dark souls|ds3", e.findtext("a:title", "", ATOM), re.I):
            continue
        yield {"f": "youtube", "t": e.findtext("a:title", "", ATOM),
               "u": e.find("a:link", ATOM).get("href"),
               "d": data_iso(e.findtext("a:published", "", ATOM)), "a": "VaatiVidya"}


def reddit():
    raiz = ET.fromstring(baixar("https://www.reddit.com/r/darksouls3/top/.rss?t=week&limit=6"))
    for e in raiz.findall("a:entry", ATOM):
        autor = e.findtext("a:author/a:name", "", ATOM)
        yield {"f": "reddit", "t": e.findtext("a:title", "", ATOM),
               "u": e.find("a:link", ATOM).get("href"),
               "d": data_iso(e.findtext("a:published", "", ATOM)), "a": autor}


def speedrun():
    url = (f"https://www.speedrun.com/api/v1/runs?game={SPEEDRUN_JOGO}&status=verified"
           f"&orderby=verify-date&direction=desc&max=30&embed=players,category")
    vistos = set()  # quem manda várias runs de uma vez aparece só com a mais recente
    for run in json.loads(baixar(url))["data"]:
        jogadores = ", ".join(p.get("names", {}).get("international") or p.get("name", "?")
                              for p in run["players"]["data"])
        categoria = run["category"]["data"]["name"]
        if (jogadores, categoria) in vistos:
            continue
        vistos.add((jogadores, categoria))
        if len(vistos) > 4:
            return
        yield {"f": "speedrun", "t": f"{categoria} em {duracao(run['times']['primary_t'])}",
               "u": run["weblink"], "d": data_iso(run["status"]["verify-date"]), "a": jogadores}


FONTES = {"steam": steam, "youtube": youtube, "reddit": reddit, "speedrun": speedrun}


def main():
    anterior = {}
    if os.path.exists(SAIDA):
        with open(SAIDA, encoding="utf-8") as f:
            anterior = json.load(f)

    itens, falhas = [], []
    for nome, fonte in FONTES.items():
        try:
            novos = list(fonte())
        except Exception as erro:
            print(f"[{nome}] falhou ({erro}); mantendo as publicações anteriores", file=sys.stderr)
            novos = [i for i in anterior.get("itens", []) if i["f"] == nome]
            falhas.append(nome)
        itens += [{k: v for k, v in i.items() if v} for i in novos]

    itens.sort(key=lambda i: i["d"], reverse=True)
    if itens == anterior.get("itens"):
        print("Nada novo.")
        return
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump({"atualizado": data_iso(datetime.now(timezone.utc).isoformat()), "itens": itens},
                  f, ensure_ascii=False, indent=1)
    print(f"{len(itens)} publicações salvas em {os.path.relpath(SAIDA, RAIZ)}"
          + (f" (falharam: {', '.join(falhas)})" if falhas else ""))
    if len(falhas) == len(FONTES):
        sys.exit(1)


if __name__ == "__main__":
    main()
