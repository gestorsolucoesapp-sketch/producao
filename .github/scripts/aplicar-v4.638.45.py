from pathlib import Path

OLD="4.638.44"
NEW="4.638.45"

idx=Path("index.html")
s=idx.read_text(encoding="utf-8")
if OLD not in s:
    raise SystemExit("versao antiga nao encontrada no index")
s=s.replace(OLD,NEW)
tag='<script src="./iniflex-portal-v4.638.45.js?v=4.638.45"></script>'
if tag not in s:
    s=s.replace("</body>",tag+"\n</body>")
idx.write_text(s,encoding="utf-8")

sw=Path("sw.js")
w=sw.read_text(encoding="utf-8")
if OLD not in w:
    raise SystemExit("versao antiga nao encontrada no sw")
w=w.replace(OLD,NEW)
sw.write_text(w,encoding="utf-8")

assert "const APP_VER = '4.638.45';" in s
assert '>v4.638.45<small id="verData"' in s
assert tag in s
assert "producao-rioplastic-v4.638.45" in w
print("v4.638.45 pronta")
