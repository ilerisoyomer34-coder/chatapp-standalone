# Aşama 5 — Gerçek uçtan uca şifreleme: açıklama ve onay

**Durum: uygulanmadı, onayını bekliyor.** Bu aşama yapılmadığı için arayüzde "uçtan uca şifreli" ifadesi hiçbir
yerde geçmiyor; yerine doğru olan "Bağlantın şifreli (HTTPS)" yazıyor.

## Önerilen tasarım (kısaca)

- Her cihaz ilk açılışta Web Crypto ile bir **ECDH P-256** anahtar çifti üretir. Özel anahtar
  **IndexedDB'de dışa aktarılamaz** (`extractable: false`) olarak durur; açık anahtar
  `users/{uid}/keys/{deviceId}` altına yazılır.
- Her mesaj için rastgele bir **AES-GCM 256** mesaj anahtarı üretilir; metin ve ekler bununla şifrelenir.
  Mesaj anahtarı, sohbetteki **her alıcı cihazın** açık anahtarıyla (ECDH + HKDF) ayrı ayrı sarılır ve
  mesajın yanına yazılır. Sunucu yalnızca şifreli veri görür.
- Ekler de istemcide şifrelenip Storage'a öyle yüklenir; küçük resim de şifreli olur.
- Bildirim gövdesi sunucuda okunamayacağı için **"Yeni mesaj"** olur. (İsteğe bağlı: servis çalışanı
  IndexedDB'deki anahtarla çözüp gerçek metni gösterebilir; iOS'ta bu her zaman güvenilir değildir.)
- Sohbet içinde arama, bildirim önizlemesi ve sohbet listesindeki son mesaj önizlemesi yalnızca cihazda,
  çözülmüş veriyle çalışır.

## Asıl sorunlar ve seçenekler

### 1. Çoklu cihaz (telefon + bilgisayar)

Anahtar cihaza bağlı olduğu için her mesaj, alıcının **o anda kayıtlı tüm cihazları** için ayrı ayrı sarılır.

| | Artı | Eksi |
|---|---|---|
| Cihaz başına anahtar (önerilen) | Özel anahtar hiçbir zaman cihazdan çıkmaz; en güçlü güvenlik | Mesaj boyutu cihaz sayısıyla büyür (50 kişilik grupta ~100 sarılmış anahtar); 50 üyelik grup sınırıyla yönetilebilir |
| Hesap başına tek anahtar, cihazlar arasında paylaşılır | Basit; her mesaj tek kez sarılır | Anahtarın cihazlar arasında taşınması gerekir (QR ile eşleştirme veya şifreli yedek); taşıma yolu saldırı yüzeyi olur |

Yeni cihaz eklendiğinde karşı tarafa "güvenlik kodu değişti" uyarısı göstermek gerekir; yoksa sunucuya sızan
biri sahte bir cihaz anahtarı ekleyip sonraki mesajları okuyabilir. Kullanıcıların güvenlik kodunu (parmak izi)
karşılaştırabileceği bir ekran gerekir.

### 2. Yeni cihazda eski mesajlar

Yeni cihazın anahtarı eski mesajlar şifrelenirken yoktu; bu yüzden **eski mesajlar yeni cihazda okunamaz**.

| Seçenek | Artı | Eksi |
|---|---|---|
| Eski mesajlar görünmez ("Bu mesaj bu cihazda okunamıyor") | En güvenli, en basit (Signal böyle) | Telefon değiştiren kullanıcı geçmişini kaybeder |
| Eski cihaz yeni cihaza geçmişi aktarır (iki cihaz da açıkken QR ile) | Geçmiş korunur, sunucu yine göremez | İki cihazın aynı anda elde olması gerekir; uygulaması zor ve uzun sürer |
| Şifreli anahtar yedeği (aşağıda) | Eski cihaz kaybolsa da geçmiş geri gelir | Yedek parolası unutulursa her şey kaybolur; zayıf parola yedeği kırılabilir kılar |

### 3. Anahtar yedeği

Kullanıcının belirlediği ayrı bir **yedek parolasından** (PBKDF2/Argon2 ile türetilen anahtar) şifrelenmiş
anahtar yedeği sunucuda tutulabilir.

| | Artı | Eksi |
|---|---|---|
| Yedek yok | Sunucuda hiçbir anahtar izi yok | Cihaz kaybolunca/silinince tüm geçmiş kalıcı olarak kaybolur |
| Parolalı yedek | Kurtarma mümkün | Parolayı unutan kullanıcıya **hiçbir şekilde** yardım edilemez (yönetici de açamaz); zayıf parolalar çevrimdışı deneme saldırısına açıktır |

"Şifremi unuttum" e-postası **hesabı** kurtarır ama **mesajları** kurtaramaz; bu fark kullanıcıya açıkça
anlatılmalıdır.

### 4. Diğer etkileri

- **Şikâyet ve yönetici:** yönetici şikâyet edilen mesajı göremez; şikâyet eden kişinin cihazı ilgili mesajları
  çözüp şikâyete ekleyebilir (kullanıcının açık rızasıyla).
- **Sunucu tarafı özellikler:** sohbet listesindeki önizleme ve bildirim metni sunucuda üretilemez
  ("Yeni mesaj" yazar); arama yalnızca cihazdaki son mesajlarda çalışır.
- **Mevcut mesajlar:** E2EE açılmadan önceki mesajlar şifresiz kalır (istersen yalnızca yeni sohbetlerde açılır).
- **Süre:** tahminen bu projede en büyük aşama (kriptografi, anahtar yönetimi, testler ve güvenlik kodu ekranı).

## Önerim

Kullanıcı sayısı küçük ve kurtarma ihtiyacı yüksek bir uygulama için:

1. **Cihaz başına anahtar**, en fazla 5 cihaz;
2. **İsteğe bağlı parolalı anahtar yedeği** (Ayarlar → "Mesaj yedeği"), açıklayıcı uyarıyla;
3. Yedek yoksa yeni cihazda eski mesajlar "Bu mesaj bu cihazda okunamıyor" olarak görünür;
4. Bildirimde "Yeni mesaj" (içerik gizli);
5. Güvenlik kodu karşılaştırma ekranı ve "güvenlik kodu değişti" sistem mesajı.

**Onay sorusu:** Bu tasarımla Aşama 5'e başlayayım mı? Yoksa şimdilik "Bağlantın şifreli (HTTPS)" ile kalıp
bu aşamayı ileriye mi bırakalım? Seçeneklerden (ör. yedek olmasın, eski mesajlar aktarılsın) farklı bir tercihin
varsa onu da yaz.
