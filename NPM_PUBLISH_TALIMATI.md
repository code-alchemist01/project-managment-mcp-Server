# NPM'e Publish Etme Talimatları

## 📦 Adım Adım NPM Publish

### 1. NPM Hesabı Oluşturma/Login

```bash
# NPM'e login olun (eğer hesabınız yoksa npmjs.com'dan oluşturun)
npm login
```

**Not:** Eğer `@code-alchemist01` scope'u için publish yapacaksanız, bu scope size ait olmalı veya organization olarak oluşturulmalı.

### 2. Package.json Kontrolü

✅ `package.json` zaten güncellendi:
- Name: `@code-alchemist01/mcp-project-manager`
- Repository: GitHub URL eklendi
- Keywords: MCP ile ilgili keyword'ler eklendi
- PublishConfig: Public access ayarlandı

### 3. Build ve Publish

```bash
# Önce projeyi derleyin
npm run build

# Sonra publish edin
npm publish
```

### 4. Alternatif: Scope Olmadan Publish

Eğer `@code-alchemist01` scope'u sorun çıkarırsa, package.json'daki name'i değiştirin:

```json
{
  "name": "mcp-project-manager",
  ...
}
```

Sonra:
```bash
npm publish
```

### 5. Publish Sonrası

Publish başarılı olduktan sonra:
- Paket şurada görünecek: https://www.npmjs.com/package/@code-alchemist01/mcp-project-manager
- Veya: https://www.npmjs.com/package/mcp-project-manager

### 6. Versiyon Güncelleme

Yeni versiyon publish etmek için:
```bash
npm version patch  # 1.0.0 -> 1.0.1
# veya
npm version minor  # 1.0.0 -> 1.1.0
# veya
npm version major  # 1.0.0 -> 2.0.0

npm publish
```

## ⚠️ Önemli Notlar

1. **Scope Kullanımı:** `@code-alchemist01` scope'u için npm'de organization oluşturmanız gerekebilir
2. **İlk Publish:** İlk publish'te npm sizden onay isteyebilir
3. **2FA:** Eğer 2FA aktifse, OTP kodu girmeniz gerekebilir

## 🔗 NPM Paket Sayfası

Publish sonrası paketiniz şurada olacak:
- https://www.npmjs.com/package/@code-alchemist01/mcp-project-manager

