from pathlib import Path

OLD = "4.638.43"
NEW = "4.638.44"

def bump(path):
    p = Path(path)
    s = p.read_text(encoding="utf-8")
    n = s.count(OLD)
    if n == 0:
        raise SystemExit(f"{path}: versao {OLD} nao encontrada")
    s = s.replace(OLD, NEW)
    p.write_text(s, encoding="utf-8")
    print(f"{path}: {n} ocorrencia(s) atualizada(s)")

bump("index.html")
bump("sw.js")

idx = Path("index.html").read_text(encoding="utf-8")
sw = Path("sw.js").read_text(encoding="utf-8")

assert f"const APP_VER = '{NEW}';" in idx
assert f">v{NEW}<small id=\"verData\"" in idx
assert f"Produção Rioplastic — v{NEW}" in sw
assert f"producao-rioplastic-v{NEW}" in sw

print("Bump concluido:", NEW)
