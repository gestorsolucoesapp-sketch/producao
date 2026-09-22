from pathlib import Path
import subprocess

BASE_COMMIT="68a2d44c30ab2b101485822a1bfbb89e16821232"
OLD="4.638.44"
NEW="4.638.47"
TAG='<script src="./iniflex-portal-v4.638.46.js?v=4.638.47"></script>'

# Restaura arquivos LIMPOS da v4.638.44.
idx_bytes=subprocess.check_output(["git","show",f"{BASE_COMMIT}:index.html"])
sw_bytes=subprocess.check_output(["git","show",f"{BASE_COMMIT}:sw.js"])
s=idx_bytes.decode("utf-8")
w=sw_bytes.decode("utf-8")

if "const APP_VER = '4.638.44';" not in s:
    raise SystemExit("base limpa esperada nao encontrada")
if "producao-rioplastic-v4.638.44" not in w:
    raise SystemExit("sw base limpo esperado nao encontrado")

s=s.replace(OLD,NEW)
w=w.replace(OLD,NEW)

# Insere UMA vez somente antes do fechamento final real do documento.
pos=s.rfind("</body>")
if pos<0:
    raise SystemExit("</body> final nao encontrado")
s=s[:pos]+TAG+"\n"+s[pos:]

if s.count(TAG)!=1:
    raise SystemExit(f"tag externa repetida: {s.count(TAG)}")
if "const APP_VER = '4.638.47';" not in s:
    raise SystemExit("APP_VER nao atualizado")
if '>v4.638.47<small id="verData"' not in s:
    raise SystemExit("badge nao atualizado")
if "producao-rioplastic-v4.638.47" not in w:
    raise SystemExit("cache nao atualizado")

Path("index.html").write_text(s,encoding="utf-8")
Path("sw.js").write_text(w,encoding="utf-8")
print("restaurado da v4.638.44 e reaplicado com seguranca")
print("tag_count",s.count(TAG))
