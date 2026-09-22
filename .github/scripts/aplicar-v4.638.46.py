from pathlib import Path

OLD="4.638.45"
NEW="4.638.46"
BAD='<script src="./iniflex-portal-v4.638.45.js?v=4.638.45"></script>'
GOOD='<script src="./iniflex-portal-v4.638.46.js?v=4.638.46"></script>'

p=Path("index.html")
s=p.read_text(encoding="utf-8")

# Remove TODAS as inserções indevidas da 4.638.45.
s=s.replace(BAD,"")
# Segurança: se alguma tag 4.638.46 existir de tentativa anterior, remove também.
s=s.replace(GOOD,"")

# Atualiza o número da versão principal.
s=s.replace(OLD,NEW)

# Insere UMA ÚNICA vez antes do último </body> real do documento.
pos=s.rfind("</body>")
if pos<0:
    raise SystemExit("fechamento </body> final nao encontrado")
s=s[:pos]+GOOD+"\n"+s[pos:]

if s.count(GOOD)!=1:
    raise SystemExit(f"esperava 1 tag externa, encontrei {s.count(GOOD)}")
if "const APP_VER = '4.638.46';" not in s:
    raise SystemExit("APP_VER 4.638.46 nao encontrado")
if '>v4.638.46<small id="verData"' not in s:
    raise SystemExit("badge 4.638.46 nao encontrado")

p.write_text(s,encoding="utf-8")

sw=Path("sw.js")
w=sw.read_text(encoding="utf-8").replace(OLD,NEW)
if "producao-rioplastic-v4.638.46" not in w:
    raise SystemExit("cache 4.638.46 nao encontrado no sw")
sw.write_text(w,encoding="utf-8")

print("corrigido")
print("tag_count",s.count(GOOD))
print("body_count",s.count("</body>"))
