with open("src/main.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "centsoff" in line.lower() or "freqtomidi" in line.lower():
        print(f"{i+1}: {line.strip()}")
