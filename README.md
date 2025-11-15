[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/code-alchemist01-project-managment-mcp-server-badge.png)](https://mseep.ai/app/code-alchemist01-project-managment-mcp-server)

# MCP Database Manager

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.0-orange.svg)](https://modelcontextprotocol.io/)

Comprehensive MCP (Model Context Protocol) server for database management and analysis. Supports multiple database types including PostgreSQL, MySQL, SQLite, SQL Server, MongoDB, and Redis.

## 🎯 Ne İşe Yarar?

MCP Database Manager, AI asistanlarının (Cursor, Claude, vb.) veritabanlarıyla etkileşime girmesi, sorguları analiz etmesi ve veritabanı yönetim görevlerini gerçekleştirmesi için kapsamlı bir MCP server'dır.

### Temel Özellikler

- **🔌 Çoklu Veritabanı Desteği**: PostgreSQL, MySQL, SQLite, SQL Server, MongoDB, Redis
- **🔍 SQL Sorgu Analizi**: Performance analizi, execution plan, index önerileri
- **📊 Şema Yönetimi**: ER diyagramları, migration generation, dokümantasyon
- **📈 Veri Analizi**: İstatistikler, kalite kontrolü, duplicate detection
- **💾 Backup & Restore**: Otomatik backup ve restore işlemleri
- **🔒 Güvenlik**: İzin analizi, güvenlik açığı tespiti, sensitive data detection

## 🚀 Kurulum

### Gereksinimler

- Node.js 18 veya üzeri
- npm veya yarn
- TypeScript (dev dependency)

### Adımlar

1. **Repository'yi klonlayın:**
```bash
git clone https://github.com/code-alchemist01/database-manager-mcp-Server.git
cd database-manager-mcp-Server
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
    "database-manager": {
      "command": "node",
      "args": [
        "C:\\Users\\YourUsername\\path\\to\\database-manager-mcp-Server\\dist\\index.js"
      ]
    }
  }
}
```

**Not:** `args` içindeki path'i kendi proje yolunuza göre güncelleyin.

### 3. Cursor'u Yeniden Başlatın

Config dosyasını kaydettikten sonra Cursor'u tamamen kapatıp yeniden açın.

### 4. Doğrulama

Cursor'da **Settings > Tools & MCP** bölümünde "database-manager" listede görünmeli.

## 🛠️ Kullanım

### Cursor Chat'te Örnek Komutlar

```
SQLite veritabanına bağlan: sqlite://test.db
```

```
Bağlı veritabanların listesini göster
```

```
Şemayı göster
```

```
users tablosunun istatistiklerini getir
```

```
SELECT * FROM users WHERE age > 25 sorgusunu analiz et
```

```
users tablosunda duplicate kayıtları bul
```

## 📋 MCP Tools (27 Araç)

### Connection Management (4)
- `connect_database` - Veritabanına bağlan
- `list_connections` - Aktif bağlantıları listele
- `disconnect_database` - Bağlantıyı kapat
- `test_connection` - Bağlantıyı test et

### Query Analysis (5)
- `analyze_query` - SQL sorgusunu analiz et
- `explain_query` - Execution plan göster
- `optimize_query` - Sorgu optimizasyon önerileri
- `detect_slow_queries` - Yavaş sorguları tespit et
- `suggest_indexes` - Index önerileri

### Schema Management (5)
- `get_schema` - Şema bilgilerini getir
- `visualize_schema` - ER diyagramı oluştur (Mermaid)
- `analyze_foreign_keys` - Foreign key analizi
- `generate_migration` - Migration script oluştur
- `document_schema` - Şema dokümantasyonu

### Data Analysis (5)
- `get_table_stats` - Tablo istatistikleri
- `analyze_data_quality` - Veri kalitesi analizi
- `find_duplicates` - Duplicate kayıtları bul
- `sample_data` - Veri örnekleme
- `generate_report` - Custom rapor oluştur

### Backup & Restore (4)
- `create_backup` - Backup oluştur
- `list_backups` - Backup'ları listele
- `restore_backup` - Backup'tan geri yükle
- `verify_backup` - Backup doğrula

### Security (4)
- `analyze_permissions` - İzin analizi
- `detect_vulnerabilities` - Güvenlik açığı tespiti
- `find_sensitive_data` - Hassas veri tespiti
- `audit_logs` - Audit log analizi

## 🗄️ Desteklenen Veritabanları

| Veritabanı | Durum | Özellikler |
|-----------|-------|------------|
| PostgreSQL | ✅ | Connection, Query, Schema, Transactions |
| MySQL | ✅ | Connection, Query, Schema, Transactions |
| SQLite | ✅ | Connection, Query, Schema, Transactions |
| SQL Server | ✅ | Connection, Query, Schema, Transactions |
| MongoDB | ✅ | Connection, Query, Schema, Collections |
| Redis | ✅ | Connection, Commands, Keys |

## 📁 Proje Yapısı

```
database-manager-mcp-Server/
├── src/
│   ├── index.ts                 # MCP server ana giriş noktası
│   ├── server.ts                # MCP server implementasyonu
│   ├── tools/                   # MCP tools
│   │   ├── connection.ts        # Veritabanı bağlantı yönetimi
│   │   ├── query-analysis.ts   # Sorgu analizi
│   │   ├── schema-management.ts # Şema yönetimi
│   │   ├── data-analysis.ts    # Veri analizi
│   │   ├── backup-restore.ts   # Backup/restore
│   │   └── security.ts         # Güvenlik
│   ├── database/                # Veritabanı adaptörleri
│   │   ├── base-adapter.ts     # Temel adapter interface
│   │   ├── postgresql.ts       # PostgreSQL adapter
│   │   ├── mysql.ts            # MySQL adapter
│   │   ├── sqlite.ts           # SQLite adapter
│   │   ├── mssql.ts            # SQL Server adapter
│   │   ├── mongodb.ts          # MongoDB adapter
│   │   └── redis.ts            # Redis adapter
│   ├── analyzers/               # Analiz motorları
│   │   ├── query-analyzer.ts   # Sorgu analizi
│   │   ├── schema-analyzer.ts  # Şema analizi
│   │   ├── data-analyzer.ts    # Veri analizi
│   │   └── security-analyzer.ts # Güvenlik analizi
│   ├── utils/                   # Yardımcı fonksiyonlar
│   │   ├── connection-manager.ts
│   │   ├── query-builder.ts
│   │   └── formatters.ts
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

### Senaryo 1: SQLite Veritabanı Analizi

```javascript
// Cursor chat'te:
"SQLite veritabanına bağlan: sqlite://mydb.db"
"Şemayı göster"
"users tablosunun istatistiklerini getir"
"users tablosunda duplicate kayıtları bul"
```

### Senaryo 2: PostgreSQL Query Optimizasyonu

```javascript
// Cursor chat'te:
"PostgreSQL veritabanına bağlan: postgresql://user:pass@localhost:5432/dbname"
"SELECT * FROM orders WHERE customer_id = 123 sorgusunu analiz et"
"Bu sorgu için index önerileri yap"
```

### Senaryo 3: Schema Migration

```javascript
// Cursor chat'te:
"İki şema arasındaki farkları bul ve migration script oluştur"
"Schema'yı ER diagram olarak görselleştir"
```

## 🔐 Güvenlik

- Connection string'ler güvenli saklanır
- SQL injection koruması (parameterized queries)
- Query timeout yönetimi
- Read-only mode desteği
- Input validation ve sanitization

## 📊 Çıktı Formatları

- **JSON** - Structured data responses
- **Markdown** - Raporlar ve dokümantasyon
- **CSV** - Veri export
- **SQL** - Migration scripts
- **Mermaid** - ER diyagramları

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

