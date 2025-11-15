# MCP Project Management Server

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.0-orange.svg)](https://modelcontextprotocol.io/)

Akıllı Dosya ve Proje Yönetim MCP Server - AI asistanlarının proje analizi, kod metrikleri, dokümantasyon ve Git işlemlerini yönetebileceği kapsamlı bir Model Context Protocol (MCP) server.

## 🎯 Ne İşe Yarar?

MCP Project Management Server, AI asistanlarının (Cursor, Claude, vb.) projeleri analiz etmesi, kod kalitesini değerlendirmesi, dokümantasyon oluşturması ve Git işlemlerini yönetmesi için kapsamlı bir MCP server'dır.

### Temel Özellikler

- **📊 Proje Analizi**: Proje yapısı analizi, bağımlılık haritalama, dosya organizasyonu
- **📈 Kod Metrikleri**: Complexity analizi, code coverage, performans metrikleri
- **📝 Dokümantasyon**: Otomatik dokümantasyon oluşturma, API dokümantasyonu, README generation
- **🔧 Git Yönetimi**: Commit analizi, branch yönetimi, diff görüntüleme, merge conflict çözümü
- **🔍 Kod Kalitesi**: Linting, code review, best practices kontrolü
- **📁 Dosya Yönetimi**: Dosya arama, organizasyon, template oluşturma

## 🚀 Kurulum

### Gereksinimler

- Node.js 18 veya üzeri
- npm veya yarn
- TypeScript (dev dependency)
- Git (Git işlemleri için)

### Adımlar

1. **Repository'yi klonlayın:**

```bash
git clone https://github.com/code-alchemist01/project-managment-mcp-Server.git
cd project-managment-mcp-Server
```

2. **Bağımlılıkları yükleyin:**

```bash
npm install
```

3. **Projeyi derleyin:**

```bash
npm run build
```

4. **Test edin:**

```bash
npm start
```

## 📦 Cursor'a Kurulum

### 1. MCP Config Dosyasını Oluştur/Düzenle

**Windows:**

```
%APPDATA%\Cursor\User\globalStorage\mcp.json
```

**macOS/Linux:**

```
~/.config/Cursor/User/globalStorage/mcp.json
```

### 2. Config İçeriği

```json
{
  "mcpServers": {
    "project-management": {
      "command": "node",
      "args": [
        "C:\\Users\\YourUsername\\path\\to\\project-managment-mcp-Server\\dist\\index.js"
      ]
    }
  }
}
```

**Not:** `args` içindeki path'i kendi proje yolunuza göre güncelleyin.

### 3. Cursor'u Yeniden Başlatın

Config dosyasını kaydettikten sonra Cursor'u tamamen kapatıp yeniden açın.

### 4. Doğrulama

Cursor'da **Settings > Tools & MCP** bölümünde "project-management" listede görünmeli.

## 🛠️ Kullanım

### Cursor Chat'te Örnek Komutlar

```
Proje yapısını analiz et
```

```
Kod metriklerini göster
```

```
README dosyası oluştur
```

```
Git commit geçmişini göster
```

```
Kod kalitesi raporu oluştur
```

```
Bağımlılık ağacını görselleştir
```

## 📋 MCP Tools

### Proje Analizi (6)

- `analyze_project_structure` - Proje yapısını analiz et
- `analyze_dependencies` - Bağımlılıkları analiz et
- `generate_dependency_graph` - Bağımlılık grafiği oluştur
- `find_unused_files` - Kullanılmayan dosyaları bul
- `analyze_file_organization` - Dosya organizasyonunu analiz et
- `detect_code_smells` - Kod kokularını tespit et

### Kod Metrikleri (5)

- `calculate_complexity` - Kod karmaşıklığını hesapla
- `get_code_statistics` - Kod istatistiklerini getir
- `analyze_test_coverage` - Test coverage analizi
- `measure_performance` - Performans metrikleri
- `generate_metrics_report` - Metrik raporu oluştur

### Dokümantasyon (5)

- `generate_readme` - README dosyası oluştur
- `generate_api_docs` - API dokümantasyonu oluştur
- `document_code` - Kod dokümantasyonu oluştur
- `create_changelog` - CHANGELOG oluştur
- `generate_architecture_doc` - Mimari dokümantasyon oluştur

### Git Yönetimi (6)

- `analyze_git_history` - Git geçmişini analiz et
- `show_git_status` - Git durumunu göster
- `create_git_branch` - Git branch oluştur
- `analyze_commits` - Commit'leri analiz et
- `resolve_merge_conflicts` - Merge conflict çözümü
- `generate_git_report` - Git raporu oluştur

### Kod Kalitesi (5)

- `run_linter` - Linter çalıştır
- `perform_code_review` - Kod incelemesi yap
- `check_best_practices` - Best practices kontrolü
- `find_security_issues` - Güvenlik sorunlarını bul
- `generate_quality_report` - Kalite raporu oluştur

### Dosya Yönetimi (4)

- `search_files` - Dosya arama
- `organize_files` - Dosyaları organize et
- `create_file_template` - Dosya şablonu oluştur
- `manage_project_structure` - Proje yapısını yönet

## 📁 Proje Yapısı

```
project-managment-mcp-Server/
├── src/
│   ├── index.ts                 # MCP server ana giriş noktası
│   ├── server.ts                # MCP server implementasyonu
│   ├── tools/                   # MCP tools
│   │   ├── project-analysis.ts  # Proje analizi
│   │   ├── code-metrics.ts      # Kod metrikleri
│   │   ├── documentation.ts     # Dokümantasyon
│   │   ├── git-management.ts    # Git yönetimi
│   │   ├── code-quality.ts      # Kod kalitesi
│   │   └── file-management.ts   # Dosya yönetimi
│   ├── analyzers/               # Analiz motorları
│   │   ├── project-analyzer.ts  # Proje analizi
│   │   ├── code-analyzer.ts     # Kod analizi
│   │   ├── dependency-analyzer.ts # Bağımlılık analizi
│   │   └── quality-analyzer.ts  # Kalite analizi
│   ├── generators/              # Generator'lar
│   │   ├── doc-generator.ts     # Dokümantasyon generator
│   │   ├── template-generator.ts # Şablon generator
│   │   └── report-generator.ts  # Rapor generator
│   ├── utils/                   # Yardımcı fonksiyonlar
│   │   ├── git-utils.ts         # Git yardımcıları
│   │   ├── file-utils.ts        # Dosya yardımcıları
│   │   └── formatters.ts        # Formatlayıcılar
│   └── types/                   # TypeScript tip tanımları
│       └── index.ts
├── dist/                        # Derlenmiş JavaScript dosyaları
├── package.json
├── tsconfig.json
└── README.md
```

## 🔧 Geliştirme

### Development Modu

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## 📝 Örnek Kullanım Senaryoları

### Senaryo 1: Proje Analizi ve Dokümantasyon

```javascript
// Cursor chat'te:
"Proje yapısını analiz et"
"Bağımlılık grafiğini oluştur"
"README dosyası oluştur"
"API dokümantasyonu oluştur"
```

### Senaryo 2: Kod Kalitesi ve Metrikler

```javascript
// Cursor chat'te:
"Kod metriklerini hesapla"
"Kod kalitesi raporu oluştur"
"Test coverage analizi yap"
"Best practices kontrolü yap"
```

### Senaryo 3: Git Yönetimi

```javascript
// Cursor chat'te:
"Git commit geçmişini analiz et"
"Yeni bir feature branch oluştur"
"Merge conflict'leri çöz"
"Git raporu oluştur"
```

## 🔐 Güvenlik

- Dosya sistem erişim kontrolü
- Git repository güvenliği
- Input validation ve sanitization
- Sensitive data detection
- Secure file operations

## 📊 Çıktı Formatları

- **JSON** - Structured data responses
- **Markdown** - Raporlar ve dokümantasyon
- **HTML** - Web tabanlı raporlar
- **SVG/PNG** - Grafikler ve diyagramlar
- **CSV** - Veri export

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit edin (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın

## 📄 Lisans

MIT License - Detaylar için [LICENSE](LICENSE) dosyasına bakın.

## 🙏 Teşekkürler

- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP standardı için
- [Cursor](https://cursor.sh/) - MCP desteği için

## 📞 İletişim

Sorularınız veya önerileriniz için issue açabilirsiniz.

---

**⭐ Bu projeyi beğendiyseniz yıldız vermeyi unutmayın!**
