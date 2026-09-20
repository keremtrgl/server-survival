# Server Survival Profesyonelleştirme ve Teknik Yol Haritası

## Yönetici özeti

Server Survival, sıradan bir prototipten belirgin biçimde ileride: özgün 3B ağ tahtası, gerçek bulut mimarisi kavramlarını oyun mekaniğine bağlayan güçlü bir simülasyon, 25 seviyelik Campaign, Sandbox, 38 kupa, 11 dil, yerel kayıt/paylaşım ve 1.087 testlik ciddi bir temel var. En doğru yatırım, önce yeni özellik yığmak değil; bu temeli güvenilir, hızlı, anlaşılır ve erişilebilir hale getirmek.

En büyük dört fırsat şunlardır:

1. Uzun oturumlarda bellek/GPU kaybını ve yüksek RPS ile tarayıcı kilitlenmesini düzeltmek.
2. Campaign başlangıcını ve bağlantı geri bildirimini oyuncu açısından ilk kareden anlaşılır yapmak.
3. CDN tabanlı üretim kurulumunu paketlenmiş, güncel ve denetlenebilir bir sürüme geçirmek.
4. Erişilebilirlik, dar ekran yerleşimi ve gerçek tarayıcı testleriyle ürün kalitesini yükseltmek.

Bu belge, önce oyuncuya doğrudan zarar veren sorunları, ardından ölçeklenebilirlik ve yeni içerik fırsatlarını sıralar. Yeni özellikler için önerilen ana omurga: deterministik simülasyon, replay/daily challenge ve architecture linter; canlı çok oyunculu ise bunun son aşamasıdır.

## İncelenen sürüm ve doğrulama

| Alan | Bulgular |
| --- | --- |
| Kaynak snapshot | main, commit 01796362d3b7bfa6c85efab5e2685f4d955dc137; sürüm v3.0.0 |
| Mimari | Statik GitHub Pages uygulaması; vanilla ESM, Three.js, Tailwind CDN, backend veya hesap sistemi yok |
| Çalıştırma | Yerel HTTP sunucusunda açıldı; menü, öğretici, Campaign ve Sandbox incelendi |
| Kalite kapısı | npm run check başarılı: 61 test dosyası ve 1.087 test geçti |
| Güvenlik taraması | npm audit toplam 5 geliştirici aracı bulgusu verdi: 2 yüksek, 3 orta. npm audit --omit=dev ise üretim bağımlılığı için 0 bulgu verdi |
| Tarayıcı sinyali | Uygulama açılırken Tailwind CDN üretimde kullanılmamalı uyarısını veriyor |

Kaynak dosyaları değiştirilmedi. Bu dosya yalnızca denetim çıktısıdır.

## Korunması gereken güçlü yönler

- Cloud kavramları soyut metin değil, kapasite, maliyet, kuyruk, SLO, retry, circuit breaker, GPU/power ve failover davranışlarına bağlanmış.
- Campaign briefing/debrief, failure badge, smart hints, metrics, share URL ve save sistemi öğrenme döngüsünü destekliyor.
- Neon/glass görsel dil ve 3B board kendine ait bir kimlik oluşturuyor.
- Touch/pinch ve portre kamera için regresyon testleri var; mobil destek tamamen sonradan düşünülmüş değil.
- Simülasyon testlerinin kapsamı, oyun kuralı regresyonlarını yakalamaya elverişli bir çekirdek sunuyor.

## Öncelikli iyileştirme sırası

P0, bir sonraki sürümden önce çözülmesi gereken kullanıcı etkili sorunları; P1, kısa dönem kalite ve güvenlik yatırımları; P2 ise mimari ve ürün büyütme çalışmalarıdır.

| Öncelik | Konu | Kanıt | Önerilen sonuç | Efor |
| --- | --- | --- | --- | --- |
| P0 | WebGL kaynak yaşam döngüsü | game.js reset sırasında dizileri sıfırlayıp sahne çocuklarını sadece remove ediyor; Service.destroy ve Request.destroy çağrılmıyor | Restart, retry ve Campaign geçişi boyunca GPU kaynakları eksiksiz dispose edilir | Orta |
| P0 | Yüksek RPS/burst koruması | game.js Sandbox RPS ve burst alanları için güvenli üst sınır koymuyor; spawn döngüsü while ile sınırsız catch-up yapıyor | Tarayıcı kilitlenmeden yoğun yük öğretilebilir ve özetlenebilir olur | Küçük-Orta |
| P0 | Save import doğrulaması | save-load.js dosyayı parse ettikten sonra şema/kota doğrulaması olmadan state'i temizleyip restore ediyor | Bozuk/çok büyük kayıt, oyunu bozmaz veya kaynak tüketmez | Orta |
| P0 | Campaign ilk-kare bağlamı | Campaign hedefleri ilk 0,5 saniyelik oyun tick'ine kadar render edilmiyor; HUD Survival metni gösteriyor | Oyuncu Play'e basmadan önce ne yapacağını bilir | Küçük |
| P0 | Sandbox panel çakışması | 1280x720 görünümde Burst/DDoS denetimleri alt toolbar altında kalabiliyor | Tüm kontrol alanları her desteklenen ekranda erişilebilir | Küçük |
| P1 | Bağlantı geri bildirimi | Geçersiz bağlantı yalnız ses ve console.error üretiyor | Oyuncu neden bağlantının reddedildiğini ekranda görür | Küçük |
| P1 | Erişilebilirlik temeli | İsimlendirilmemiş ikon butonları, clickable div'ler, focus/reduced-motion eksikliği, pointer-merkezli canvas | Klavye, ekran okuyucu ve hareket hassasiyeti olan kullanıcılar oynayabilir | Orta |
| P1 | Üretim paketleme ve bağımlılık güncellemesi | Tailwind Play CDN, Three.js r128 CDN globali ve SRI yok | Pinlenmiş, cache'lenebilir, minify edilmiş dağıtım | Orta |
| P1 | Gerçek tarayıcı QA | Mevcut testler güçlü fakat headless sim ağırlıklı | Chromium/WebGL, resize, touch, visual ve a11y regresyonları yakalanır | Orta |
| P2 | Simülasyon/render ayrımı | STATE singleton, global handler'lar, Math.random ve setTimeout akışı | Replay, daily challenge, doğrulanabilir skor ve sonra multiplayer mümkün olur | Büyük |

## P0: güvenilirlik ve performans

### 1. Resetlerde GPU/VRAM kaynaklarını serbest bırakın

Mevcut reset akışı, STATE.services, STATE.requests ve STATE.connections dizilerini temizliyor; sonra serviceGroup, requestGroup ve connectionGroup çocuklarını yalnız sahneden çıkarıyor. Bu, Three.js geometry ve material nesnelerinin dispose edilmesine eşdeğer değildir. Böylece restart, Retry ve Campaign seviye geçişleri biriken GPU kaynağı ve olası WebGL context loss riski taşır.

Service.destroy içindeki temizlik de henüz tam değildir: loadRing ile SQS queueFill çocuklarının geometry/material kaynakları kapsanmıyor. Doğru çözüm:

1. State dizilerini silmeden önce her Request ve Service için destroy çağırın.
2. Bağlantıları, badge'leri, autoscaling satellite'lerini ve tüm child mesh'leri kapsayan tek bir recursive disposeObject3D yardımcısı oluşturun.
3. Paylaşılan geometry/material cache'i eklenmeden önce kaynakların sahipliğini açıkça tanımlayın; paylaşılan kaynaklar ref-count veya merkezi ResourceManager olmadan dispose edilmemeli.
4. Restart, Retry, Campaign geçişi ve save-load için gerçek WebGL kaynak sayacı ile regresyon testi ekleyin.

Three.js'in nesne temizleme rehberi, GPU tarafındaki kaynakların kullanım sonunda açıkça dispose edilmesini önerir. [Three.js cleanup/dispose](https://threejs.org/manual/en/how-to-dispose-of-objects.html)

### 2. Sandbox yükünü güvenli ve öğretilebilir yapın

Sandbox RPS alanı Number.isFinite veya anlamlı bir üst sınır kullanmıyor. Infinity değeri spawnInterval değerini sıfıra indirip spawn döngüsünü sonsuz hale getirebilir. Çok yüksek ama sonlu değerler de yüzbinlerce Request, mesh ve timer oluşturarak tarayıcıyı kilitleyebilir. burstCount için de benzer sınırsızlık vardır. Ayrıca ham setTimeout ile oluşturulan burst'ler reset/pause sonrasında eski oyuna ait isteği yeni oturuma sızdırabilir.

Önerilen uygulama:

- Her sayı girdisini Number.isFinite, minimum/maksimum ve oyun moduna göre limit ile normalize edin.
- Frame başına en fazla N spawn/catch-up kuralı koyun; kalan istekler için simülasyon kuyruk sayacı kullanın.
- Görsel request sayısını ayrı tutun: yüksek RPS'de en fazla örneğin 200 görünür token; fazlası akış yoğunluğu, sayaç ve particle/aggregate olarak gösterilsin.
- Burst zamanlayıcılarını sessionEpoch ile ilişkilendirin veya simülasyon-zamanlı scheduler'a taşıyın; reset, level bitişi ve pause sırasında iptal edin.
- Limit aşıldığında sessizce kırpmak yerine Sandbox'ta "yük özetleme modu" ve görünür açıklama gösterin.

Request sınıfı her canlı istek için yeni SphereGeometry ve MeshBasicMaterial üretiyor. Aynı geometri/materyal ile çok nesne çizileceğinde InstancedMesh draw call sayısını azaltır. [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)

### 3. Ölçülebilir performans bütçesi kurun

Önce bir Debug Performance HUD ve otomatik benchmark senaryoları eklenmelidir. Ölçümler:

- FPS ile frame-time p50/p95/p99
- renderer.info içinden draw call, triangle, aktif geometry/texture
- görünür request sayısı, toplam simülasyon isteği ve kuyruk uzunluğu
- Long Animation Frame sayısı ve heap eğilimi
- 320, 375, 768 ve 1280x720 viewport'larında ilk etkileşime kadar geçen süre

Önerilen kabul senaryoları: boş board, 50 servis, 100 servis, yüksek RPS, büyük burst, 10 restart, 25 Campaign geçişi ve save import. Hedefler donanım sınıfı belirlenerek kabul edilmelidir; ölçmeden mutlak FPS hedefi koymak doğru olmaz.

Three.js renderer.info, GPU bellek ve render sürecine dair sayısal sinyaller sağlar. [WebGLRenderer info](https://threejs.org/docs/pages/WebGLRenderer.html) Tarayıcıdaki uzun animasyon kareleri için [Long Animation Frames API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing) kullanılabilir.

### 4. Render maliyetini kademe kademe azaltın

- Request rendering: trafik türü başına InstancedMesh veya object pool.
- Service rendering: sabit tip geometry/material'larını cache'leyin; yalnız dinamik yük/health göstergelerini ayrı nesne yapın.
- Cihaz uyarlaması: devicePixelRatio için üst sınır, low/medium/high kalite seçimi, düşük cihazda shadow kapama veya daha küçük shadow map.
- UI: health ve finans panelleri şu an oyun döngüsünde sık innerHTML üretiyor. Dirty flag + 4-10 Hz throttling ile güncelleyin.
- Pause/game-over: sürekli render yerine on-demand ya da düşük frekanslı render kullanın.

## P0: Campaign, Sandbox ve oyuncu geri bildirimi

### Campaign ilk karede doğru bağlamı göstermeli

Campaign Level 1 yüklenince board duraklatılmış ve boş başlıyor, ancak üst HUD Survival başlığı ve genel Survival hedefleri gösterebiliyor. CampaignController hedefleri oyun zamanı 0,5 saniyeyi geçince değerlendirip render ettiği için, oyuncu Play'e basmadan önce yanlış bağlamda kalıyor. Bu özellikle ilk kez oynayanlarda hızlı bir failure spiraline yol açıyor.

Seviye yüklenir yüklenmez:

- HUD başlığını CAMPAIGN • Level N olarak değiştirin.
- Campaign hedeflerini ve ilerleme durumunu hemen render edin.
- Eğitim seviyelerinde Play öncesi hazır olma listesi ve ghost blueprint gösterin.
- İlk örnek için Internet → Firewall → Load Balancer → Compute → Database akışını yarı saydam öneri olarak gösterin.
- Bu desteği yalnız Guided/Campaign moduna koyun; Sandbox ve ileri Survival özgür kalmalıdır.

### Bağlantı kurma başarısızlığı görünür olmalı

Geçersiz createConnection akışı tık sesi ve console.error ile sonlanıyor. Oyuncu, doğru bağlantı kuralını öğrenmek yerine hiçbir şey olmadığını sanabilir.

- İlk node seçilince geçerli hedefleri vurgulayın.
- Canvas üzerinde yön oku ve valid/invalid renkleri gösterin.
- Reddedilen bağlantıda nedenini açıklayan toast: "Compute → Firewall geçersiz; Compute yalnızca downstream Data/Cache katmanına bağlanabilir."
- Son işlemi geri alma toast'u ekleyin.
- Bu kuralları architecture linter için yeniden kullanılabilir, saf bir analiz modülüne taşıyın.

### Sandbox yüzde semantiğini düzeltin

Traffic Mix alanları yüzde olarak etiketleniyor, fakat her slider bağımsız yazılıyor ve request seçimi toplam ağırlığa göre normalize ediliyor. Oyuncu iki alanı yüzde 100 yaparsa gerçek dağılım yüzde 50 / yüzde 50 olur.

İki doğru seçenekten biri seçilmelidir:

1. Toplamı her zaman yüzde 100'e kilitleyip diğer slider'ları orantılı dengelemek.
2. Alanların adını "weight" yapmak ve toplam ile normalize edilmiş önizlemeyi açıkça göstermek.

## P1: erişilebilirlik ve responsive tasarım

### Dar ekran HUD düzeni

Sandbox paneli sabit bottom-24 ve w-80 düzeniyle çalışıyor; 1280x720 testinde Burst/DDoS satırı alt toolbar ile çakıştı. Birden çok sabit panel küçük ekranlarda board'ı ve kontrolleri daraltıyor.

Önerilen mobil/dar ekran düzeni:

- İlk katmanda yalnız Budget, Reputation ve güncel kritik sorun gösterin.
- Metrics, Finances ve Health alanlarını açılır drawer veya accordion'a taşıyın.
- Sandbox'a max-height, safe-area inset ve dahili scroll ekleyin.
- Toolbar'ı iki aşamalı compact drawer veya iki satır haline getirin.
- 320, 375, 768 ve 1280x720 ekran görüntülerini görsel regresyon testi yapın.

### Klavye, ekran okuyucu ve hareket ayarları

Somut bulgular:

- Campaign kartları clickable div olarak üretiliyor; semantik button değiller.
- Zaman düğümlerinin erişilebilir isimleri btn-pause, btn-play ve btn-fast; collapse düğmeleri yalnız ▲ şeklinde okunuyor.
- Canvas içindeki place/link yolu pointer merkezli.
- Service tooltip'leri mousemove ile çalışıyor; focus ve tap karşılığı yok.
- Dinamik failure/event/objective mesajlarında görünür ARIA live bölgesi yok.
- style.css içinde focus-visible, reduced-motion veya responsive media-query kuralı yok.

İlk erişilebilirlik paketi:

1. Campaign kartlarını button yapın; kilitli kartlar aria-disabled kullansın.
2. Tüm ikon düğmelerine anlamlı aria-label/title ve durum bilgisi ekleyin.
3. focus-visible, prefers-reduced-motion, yüksek kontrast ve renk-körü paleti ekleyin.
4. Canvas için klavyeyle seçilebilir node listesi, Service Inspector ve "from/to bağla" komut yolu sunun.
5. Failure, alert ve hedef tamamlamalarına aria-live="polite" ekleyin.
6. Tek tuşlu kısayolları kapatma/remap seçeneğiyle verin; zoom'u engellemeyin.
7. Modal'larda odak yönetimi, Escape davranışı ve geri dönüş odağını test edin.

WCAG güncel hızlı referansı, klavye erişimi, görünür odak, kontrast, hedef boyutu ve isim/rol/değer beklentilerini tanımlar. [WCAG Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/?versions=2.1)

## P1: üretim dağıtımı, güvenlik ve bağımlılıklar

### Tailwind ve Three.js'i üretim paketi haline getirin

index.html Tailwind Play CDN ve Cloudflare üzerinden Three.js r128 yüklüyor. Tailwind kendi belgelerinde Play CDN'in yalnız geliştirme amaçlı olduğunu ve üretim için tasarlanmadığını açıkça söylüyor. [Tailwind Play CDN](https://tailwindcss.com/docs/installation/play-cdn)

Önerilen geçiş:

1. Vite veya çok küçük bir esbuild/Rollup akışı ekleyin; bu oyunu framework'e taşımak demek değildir.
2. Three.js'i npm ESM bağımlılığı olarak kilitleyin; Tailwind'i derlenmiş statik CSS'e dönüştürün.
3. Minify, content hash, source map ve cache-control'a uygun dosya çıktısı alın.
4. CDN gerektiğinde sürümü tam pinleyin ve integrity/crossorigin kullanın. [Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Subresource_Integrity)
5. Inline onclick handler'ları zamanla data-action + addEventListener yapısına taşıyın; bu sıkı Content Security Policy yolunu açar.

Three.js r128, güncel r186 sürümünün 58 release gerisindedir. Birden çok kırıcı değişiklik olduğu için tek sıçrama yerine görsel regresyon testleriyle r128 → r138 → ... → r186 geçişi yapılmalı; r163 sonrası WebGL 2 desteği zorunludur. [Three.js releases](https://github.com/mrdoob/three.js/releases) ve [Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)

### Save import'u güvenli ve atomik hale getirin

Paylaşılan mimari URL'si share.js içinde boyut, tip, grid, finite sayı ve bağlantı limitleriyle gayet iyi doğrulanıyor. Aynı sınır, dışarıdan seçilen save JSON için henüz yok. Şu an dosya sadece parse ediliyor; çok büyük veya hatalı services/connections dizileri state temizlendikten sonra restore yoluna ulaşabiliyor.

Save için versioned DTO/şema ekleyin:

- Dosya byte üst sınırı
- Sürüm allowlist'i ve migration
- Maksimum servis, edge, RPS, burst ve dizi boyutu
- Bilinen service type, finite sayı, ID, grid pozisyonu, bağıntı ve bağlantı denetimi
- Geçerli yeni state'i geçici nesnede kurup tek adımda commit etme
- Bozuk girdide mevcut board'u değiştirmeden, açıklayıcı kullanıcı mesajı verme

Güvenilmeyen tüm girdilerin izinli biçim, sınır ve aralıkla doğrulanması OWASP'in temel önerisidir. [OWASP Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)

### Geliştirici araç zinciri ve CI

- npm audit geliştirici araç ağacında 2 yüksek ve 3 orta bulgu tespit etti. Kullanıcı tarayıcısına giden üretim bağımlılığı yoktur, ama contributor/CI yüzeyi için Vitest ve transitive paketler güncellenmelidir.
- Vitest 4.1.10, bildirilen güvenlik düzeltmesinden önceki bir sürümdür; lockfile kontrollü biçimde yenilenmelidir.
- Dependabot/Renovate, npm audit CI adımı, CodeQL, minimum GitHub Actions permissions ve action'ları commit SHA ile pinleme eklenmelidir.
- .github/workflows/ci.yml şu an lint ve Vitest çalıştırıyor; bu iyi temel korunmalı ve browser/performance job'ları eklenmelidir.
- i18n.js dil değişiminde tüm sözlükleri console'a yazıyor; debug logları kaldırılmalı ya da opt-in flag arkasına alınmalıdır.

[Dependabot sürüm güncellemeleri](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-version-updates), [CodeQL](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-code-scanning) ve [GitHub Actions sertleştirme](https://docs.github.com/en/code-security/tutorials/secure-your-organization/protect-against-threats) bu CI yatırımını destekler.

## P1: gerçek tarayıcı kalite kapıları

Mevcut sim testleri güçlüdür, ancak gerçek Chromium/WebGL, modal focus, responsive layout, pointer/touch ve render yaşam döngüsünü kanıtlamaz. Playwright tabanlı ayrı bir iş eklenmelidir:

- Boot ve WebGL açılış smoke testi
- Service place/select/link/delete akışları
- Hatalı bağlantı için ekranda doğru açıklama
- Campaign başlangıç HUD'u, preflight ve debrief
- Save export/import ve bozuk dosya reddi
- Share URL geçerli/geçersiz senaryoları
- Touch/pinch, 320/375/768/1280x720 layout snapshot'ları
- 10 restart ve Campaign geçişi sonrası renderer kaynak sayacı
- Çeşitli kalite modlarında performans benchmark'ı
- A11y otomatik taraması ve klavye gezintisi

Playwright'ın web-first assertion ve screenshot karşılaştırma belgeleri, bu tür regresyon testleri için uygundur. [Playwright best practices](https://playwright.dev/docs/best-practices) ve [visual comparisons](https://playwright.dev/docs/test-snapshots)

## P2: kod mimarisi ve büyüme hazırlığı

### Simülasyon çekirdeğini render/UI'dan ayırın

game.js hâlâ büyük bir composition, lifecycle ve global bridge dosyasıdır; çok sayıda modül onu geri import ediyor. STATE singleton, Math.random, performance.now ve setTimeout bağımlılıkları, aynı koşunun tekrar üretilebilmesini engelliyor.

Hedef mimari:

    GameKernel
      ├─ Deterministic Simulation (fixed tick, seeded PRNG, saf state)
      ├─ Command/Event Log (place, connect, upgrade, time-scale)
      ├─ Renderer Adapter (Three.js)
      ├─ UI Adapter (HUD, modals, inspector)
      └─ Persistence/Replay Adapter

Bu dönüşüm tek seferde yapılmamalı:

1. Önce rastgelelik için seedable RNG adaptörü ve testte sabit seed ekleyin.
2. Simülasyon tick'ini render framelerinden ayırın.
3. UI olaylarını command nesnelerine çevirin.
4. Replay'i aynı komut/event log'unu çalıştırarak ekleyin.
5. Profil buna ihtiyaç gösterirse yalnız hesaplama yoğun yol için Web Worker düşünün.

requestAnimationFrame ve Web Worker davranışları için [MDN rAF](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) ile [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) temel kaynaklardır.

### Çok oyunculu sırası

Uygulamada şu an backend, WebSocket veya sunucu otoritesi yoktur. Doğrudan socket eklemek, nondeterministik simülasyon nedeniyle desync üretir. En düşük riskli sıra:

1. Seeded daily incident
2. Local replay ve ghost
3. Sunucunun replay'i çalıştırarak doğruladığı leaderboard
4. Command-only, server-authoritative co-op

Canlı WebSocket tasarımında şema, mesaj boyutu, rate limit, room/player sınırı, reconnect snapshot ve sunucu taraflı komut reddi zorunlu olmalıdır. Standart WebSocket arayüzü doğrudan backpressure sağlamaz. [MDN WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)

## P2: öğrenme, game feel ve ürün fırsatları

### Architecture linter ve Service Inspector

Yeni servis sayısını büyütmeden önce oyuncunun mevcut sistemini anlamasına yardım edin:

- No-route, tek nokta arızası, ters bağlantı, bütçe riski, queue riski ve SLO riski
- Her uyarıda "neden" ve "sonraki eylem"
- Seçilen node için kapasite, queue, health, cost, upkeep, geçerli upstream/downstream ve bottleneck bilgisi
- Satın alma/upgrade öncesi tahmini kapasite ve maliyet etkisi

Bu, bağlantı hata mesajı, öğretici, Campaign preflight ve debrief için ortak bir eğitim altyapısı olur.

### Öğreticiyi checkpoint'li ve deneysel yapın

17 adımlı spotlight iyi bir temel, fakat uzun lineer akış yerine:

- Geri, sonra devam et ve checkpoint
- Tek kavram/tek eylem döngüsü
- Ghost blueprint ve ilerlemeli scaffolding
- Failure badge'e tıklayınca sorunlu node/edge'i odaklama
- "Neden oldu?" yanında "şimdi ne yapmalıyım?" yanıtı

### Incident deneyimini kalıcılaştırın

Kısa toast'lar kaçırılabiliyor. Son 5-10 olayı tutan Incident Log, kritik olayda isteğe bağlı otomatik pause, zaman çizelgesi ve debrief'te en çok fail eden node/en pahalı karar/önerilen deney oyunun öğrenme değerini yükseltir.

### Daha güçlü game feel

- Servis sınıflarına renkten daha ayırt edilebilir silhouette/icon.
- Cache hit, retry, breaker, autoscale, overload, failover ve outage için azaltılabilir net animasyon dili.
- Başarılı failover, DDoS, kritik bütçe ve level win için farklı earcon/müzik katmanı.
- Reduced-motion ve ses düzeyi tercihlerinin saygı gördüğü ayarlar.

### İlerleme ve topluluk

- İlk açılışta Campaign'i önerilen öğrenme yolu, Survival'ı challenge/endless olarak konumlayın.
- Guided/Standard/Expert yalnız oranları değil, event telegraphing ve yardım yoğunluğunu da değiştirsin.
- Seeded daily/weekly incident, replay/ghost ve paylaşılabilir incident postmortem ekleyin.
- Mevcut PNG/share URL'yi stars, goodput, uptime, incident çözüm süresi ve mimari kartı içeren paylaşım çıktısına dönüştürün.
- Kişisel veri içermeyen, açık rızalı funnel telemetrisiyle tutorial/level bırakma noktalarını ölçün.
- Hedef kitle Türkiye ise mevcut 11 locale'e Türkçe ekleyin.

PWA, CDN bağımlılıkları bundle'a alındıktan sonra mantıklıdır: manifest + sürümlü service worker ile kurulum ve offline deneyim sağlanabilir. [Web App Manifest](https://web.dev/learn/pwa/web-app-manifest) ve [service workers](https://web.dev/learn/pwa/service-workers)

## Önerilen teslim fazları

### Faz 1 — Stabilizasyon

- Reset/dispose, burst timer ve sandbox limitleri
- Save şeması ve atomik import
- Campaign hedeflerinin hemen render edilmesi
- Sandbox/toolbar çakışmasının düzeltilmesi
- Bağlantı hata mesajı
- Browser smoke testi

Başarı ölçütü: 10 restart + 25 Campaign geçişi, büyük burst ve bozuk save, oyun çökmeden ve state bozulmadan tamamlanır.

### Faz 2 — Profesyonel dağıtım ve erişilebilirlik

- Bundle/build, Tailwind üretim CSS, Three upgrade planı
- Dependabot/CodeQL/audit/CI sertleştirmesi
- Responsive HUD, semantic button, focus/live region/reduced motion
- Visual regression, touch/resize/a11y testleri

Başarı ölçütü: desteklenen viewport'larda örtüşen kontrol yoktur; temel oyun akışı klavye ile tamamlanabilir; dağıtım pinlenmiş varlıklarla tekrar üretilebilir.

### Faz 3 — Derinlik ve ölçüm

- Performance HUD, resource benchmark ve kalite modları
- Architecture linter, Inspector, Incident Log
- Öğretici checkpoint/preflight, daha açıklanabilir debrief
- Opt-in anonim ürün metrikleri

Başarı ölçütü: performans bütçesi izlenir, oyuncunun hatası ve sonraki eylemi her kritik noktada açıklanır.

### Faz 4 — Replay ve sosyal katman

- Seeded RNG, fixed tick, command log
- Daily challenge, replay, ghost, doğrulanabilir skor
- Son aşamada server-authoritative co-op

Başarı ölçütü: aynı seed + aynı komut dizisi aynı sonucu üretir; skor doğrulanmadan liderlik tablosuna yazılmaz.

## Karar önerisi

İlk geliştirme paketi olarak Faz 1 seçilmelidir. En yüksek kullanıcı etkisini, en düşük mimari riskle verir: oyun daha az kilitlenir, Campaign daha anlaşılır başlar, Sandbox kullanılabilir kalır ve kayıt dosyası güvenli biçimde yüklenir. Faz 2 hemen arkasından gelmelidir; yalnız ondan sonra replay/multiplayer gibi genişlemeler anlamlı ve sürdürülebilir olur.

## v3.1 doğrulama kaydı — 2026-09-20

Bu bölüm, `codex/v3-1-stabilization` çalışma ağacında 2026-09-20 18:36–19:00 TRT aralığında yeniden çalıştırılan kontrollerin kaydıdır. Üstteki v3.0 denetim tablosundaki 61 dosya / 1.087 test ve eski audit bulguları tarihsel snapshot olarak korunmuştur; aşağıdaki sayılar v3.1 için taze çıktılardır.

### Otomatik kalite ve bağımlılık denetimi

| Komut | Gerçek sonuç |
| --- | --- |
| `npm run check` | Çıkış kodu 0. ESLint bulgu üretmedi. Vitest: 68 test dosyası geçti (68/68), 1.165 test geçti (1.165/1.165). Son doğrulama başlangıcı 18:59:52; süre 23,00 sn. |
| `npm audit --omit=dev` | Çıkış kodu 0; `found 0 vulnerabilities`. |
| `npm audit` | Çıkış kodu 0; `found 0 vulnerabilities`. Geliştirici bağımlılığı bulgusu kalmadı. |

### Gerçek tarayıcı kabul sonuçları

Uygulama yalnız bu çalışma ağacından `python -m http.server 4173` ile servis edildi; test bitiminde sunucu ve geçici tarayıcı süreçleri kapatıldı.

1. Sandbox restart ve Campaign Level 1 geçişi için on tam döngü, 19:09 TRT'de Edge 153 DevTools Protocol üzerinden ana sayfa runtime'ı okunarak yeniden çalıştırıldı. Her döngüde her iki sınırdan önce gerçek iki servis (WAF ve ALB), iki geçerli bağlantı (Internet → WAF → ALB) ve bir gerçek READ `Request` oluşturuldu. Hem `STATE` koleksiyonları hem render sahnesi grupları sınırdan önce `services/requests/connections = 2/1/2` verdi. Döngü 1–10'un her birinde Restart Game sonrası ve Campaign Level 1 geçişi sonrası bu altı sayacın tamamı `0/0/0` oldu; Sandbox'a dönüş de aynı boş sayımları verdi. Komut özeti `SUMMARY allPass=true cycles=10 boundaries=20` idi. Böylece önceki başlık/boş tablo ve ekran görüntüsü kanıtı, her geçişte doğrudan state+sahne koleksiyonu kanıtıyla tamamlandı.
2. 1280×720 Sandbox görünümünde son Burst eylemi `DDoS` düğmesinin alt kenarı 543,2 px, toolbar üst kenarı 589,8 px ölçüldü; kontrol görünür kaldı ve toolbar tarafından örtülmedi. Panel `overflow-y: auto` kullandı.
3. Dar ekran kontrolleri gerçek viewport emülasyonunda sınandı: 320×568'de panel 544/406 px içerik/görünür yükseklik ve 137,6 px scroll; 375×667'de 544/506 px ve 38,4 px scroll; 768×600'de 552/438 px ve 113,6 px scroll değerine ulaştı. Her üçünde son `DDoS` eylemi viewport içinde erişilebilir kaldı. Klavye ile odaklanan `#tool-select`, viewport içinde 2,4 px solid görünür outline gösterdi.
4. Campaign Level 1 başlatıldı; Play'e basılmadan önce `Campaign` HUD başlığı, seviye başlığı, ana hedefler ve bonus hedefler görünürdü.
5. Aynı node'a bağlantı, mevcut bağlantının tekrarı, ters bağlantı ve geçersiz topoloji ayrı ayrı denendi. Canlı bölgede sırasıyla `You can't connect a node to itself.`, `Those nodes are already connected.`, `A reverse connection between those nodes already exists.` ve `Invalid connection topology: Internet -> WAF -> ALB -> Compute -> (DB/Storage)` mesajları görüldü. Canvas yalnız iki bilerek oluşturulan bağlantıyı göstermeye devam etti; reddedilen denemeler wire eklemedi.
6. Sandbox'ta 10 READ istekli Burst başlatıldı ve hemen restart yapıldı. Son planlı gecikme 270 ms iken 400 ms beklendi; yeni sahnede eski istek görünmedi, servis/bağlantı tabloları boş kaldı.
7. Firewall ve Load Balancer ile iki geçerli bağlantıdan oluşan board hazırlanıp hatalı save dosyası içe aktarıldı. İçe aktarma alert ile reddedildi; menüden Resume sonrasında iki servis ve iki bağlantı aynen görünür kaldı.
8. Reduced-motion kontrolü, yüklü Microsoft Edge 153.0.4234.48'in native `--force-prefers-reduced-motion=reduce` emülasyonuyla yapıldı. `matchMedia` sonucu true idi; başlık, Play düğmesi ve servis sağlık durumu için `animation-name: none`, `animation-duration: 0s` ve `transition-duration: 0s` ölçülürken üç durum göstergesi de görünür (`display`, `visibility`, `opacity` ve pozitif boyut) kaldı.

### Ertelenen işler

- Gerçek tarayıcı kontrolleri bu doğrulamada elle/yerel otomasyonla yapıldı; CI içinde kalıcı görsel regresyon, klavye/a11y ve WebGL kaynak sayacı kalite kapısı hâlâ eklenmiş değildir.
- Üretim paketleme ve CDN bağımlılıklarını yerel, sürümlü build çıktısına taşıma çalışması ertelenmiştir.
- Deterministik simülasyon ayrımı, replay altyapısı, architecture linter/Service Inspector ve ölçülmüş performans bütçesi bu stabilizasyon kaydının kapsamı dışındadır.
