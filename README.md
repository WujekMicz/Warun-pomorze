# Warun Pomorze – GitHub Pages + Supabase (0 zł)

- **Prognoza** jest publiczna. GitHub Actions co 3 h pobiera dane z api.met.no (`build.py`) i publikuje stronę na GitHub Pages.
- **Konta** są w Supabase. Zakłada je tylko admin (`admin.py`), a publiczna rejestracja jest wyłączona. Użytkownik dostaje hasło startowe i przy pierwszym logowaniu musi ustawić własne.
- **Skrzydła:** każdy zalogowany dodaje własne skrzydła z progami (min, max, limit porywów, różnica poryw − średni). Gotowe EN-A, EN-B i Parakite są dostępne dla wszystkich, także bez logowania.

## Jak liczone są progi

- **EN-A i EN-B:** progi dobrane osobno dla każdej miejscówki, jak w oryginale.
- **Własne skrzydła:** bierzemy progi skrzydła, ale miejscówka ma własne wymagania (`SITE` w `index.html`) i zawsze liczy się bezpieczniejsza wartość. Przykład: na wydmie w Stegnie minimum to 6 m/s, nawet jeśli skrzydło startuje od 4. W Borsku hol ma limit 5 m/s i porywy do 7 m/s.
- **Parakite:** progi osobno dla każdej miejscówki (szacunkowe, ze starej wersji apki), w `PARAKITE` w `index.html` – np. klify 6–12 m/s z porywami do 14,5, wydmy od 7 m/s. W Borsku (termika) Parakite nie jest oceniane.

## Konfiguracja (raz)

### 1. Supabase
1. Załóż darmowy projekt na supabase.com, najlepiej w regionie Frankfurt.
2. **SQL Editor:** wklej całe `supabase/schema.sql` i kliknij Run.
3. **Authentication → Sign In / Providers:** wyłącz **Allow new users to sign up**. Provider Email zostaw włączony.
4. **Project Settings → API Keys:** skopiuj URL projektu i klucz **publishable** (dawniej `anon`) do `config.js`.
5. W tym samym miejscu jest klucz **secret** (dawniej `service_role`). Wpisz go tylko do pliku `.env.admin` obok `admin.py`. Ten plik jest w `.gitignore` i nie może trafić do repozytorium:
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...
   ```

### 2. GitHub
1. Załóż **publiczne** repozytorium. Darmowe Pages działa tylko z publicznych repozytoriów, a w kodzie nie ma nic tajnego.
2. Wypchnij zawartość tego folderu na gałąź `main`.
3. **Settings → Pages → Source:** wybierz „GitHub Actions”.
4. **Actions → Prognoza → Run workflow** uruchamia pierwszą publikację. Potem robi się to samo co 3 h i po każdym pushu.

## Konta

**W przeglądarce:** zaloguj się na stronie, potem w panelu konta kliknij **Panel admina** (`admin.html`). Możesz tam zakładać konta (hasło startowe pokazuje się raz, z przyciskiem Kopiuj), resetować hasła, blokować i usuwać konta. Panel wywołuje funkcję Supabase `supabase/functions/admin`, która ma klucz serwisowy i działa tylko dla kont z rolą admina (`python3 admin.py make-admin <login>`, potem wyloguj się i zaloguj ponownie).

Wdrożenie funkcji po zmianie `index.ts`: Supabase → Edge Functions → admin → edytuj i Deploy, z wyłączonym „Verify JWT” (funkcja sama sprawdza zalogowanego użytkownika).

**Z terminala:**

```bash
python3 admin.py add jan --name "Jan Kowalski"   # wypisuje hasło startowe – przekaż je Janowi
python3 admin.py reset jan                       # nowe hasło startowe
python3 admin.py disable jan                     # blokada (enable – odblokowanie)
python3 admin.py delete jan                      # usuwa konto i jego skrzydła
python3 admin.py list
```

Login `jan` to w Supabase konto `jan@warun.invalid`. To nie jest prawdziwy adres i żaden mail nie wychodzi. Domena musi być taka sama w `config.js` (`loginDomain`).

## Dostęp i bezpieczeństwo

- Hasła hashuje i przechowuje Supabase. Ma też wbudowany limit prób logowania.
- Reguły w bazie (Row Level Security) pozwalają każdemu czytać i zmieniać wyłącznie własne skrzydła i profil. Limit to 20 skrzydeł na konto.
- Klucz publishable w `config.js` jest jawny z założenia. Bez zalogowania nie daje dostępu do żadnych danych.
- Reset hasła przez admina nie wylogowuje od razu innych urządzeń. Sesja wygasa, gdy skończy się ważność jej tokena. Żeby odciąć kogoś natychmiast, użyj `disable`.

## Ograniczenia darmowych planów

- Supabase usypia darmowy projekt po tygodniu bez ruchu. Workflow przy każdym uruchomieniu wysyła do niego zapytanie (`build.py ping`).
- GitHub wyłącza harmonogram w publicznym repozytorium po 60 dniach bez commitów. Workflow sam go ponownie włącza przez API. Gdyby to kiedyś przestało działać, wystarczy wejść w Actions i kliknąć Enable.

## Podgląd lokalny

```bash
python3 build.py demo data.js      # albo: python3 build.py fetch met && python3 build.py build met data.js
python3 -m http.server 8090        # http://localhost:8090
```
