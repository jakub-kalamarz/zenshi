# Sync Dashboard Table Redesign Design

**Date:** 2026-03-12

## Goal

Naprawic panel synchronizacji, ktory zbyt czesto pokazuje zerowe summary mimo aktywnego stanu danych, oraz zastapic uklad kart bardziej czytelna tabela operacyjna spojna z reszta web appki.

## Chosen Direction

Wybrany zostal kompaktowy uklad `summary + tabela`.

- U gory znajduje sie lekki pasek podsumowania z licznikami `active`, `queued`, `needs attention`, `freshest data`.
- Glowna zawartosc to tabela z wyraznymi kolumnami operacyjnymi zamiast dwukolumnowej siatki kart.
- Na mobile tabela sklada sie do wertykalnych, gestych wierszy z tym samym porzadkiem informacji.

## Data and State Rules

- Summary nie moze polegac wylacznie na `activeRun`, bo backend moze zwracac czesciowy stan przez `isSyncing`, `status` i `healthSummary`.
- `active` obejmuje aktywne wykonania oraz rekordy oznaczone jako synchronizujace sie.
- `queued` obejmuje jawny stan `activeRun.state === "queued"` oraz rekordy z oczekiwaniem wynikajacym ze statusu.
- `attention` obejmuje `error`, `partial`, `delayed`, `stalled`.
- Sortowanie tabeli promuje rekordy wymagajace reakcji, potem aktywne, potem oczekujace, potem zdrowe.

## Presentation

- `Site`: favicon, nazwa, skrocony adres.
- `Status`: badge i pojedynczy opis tekstowy.
- `Progress`: cienki pasek, procent, licznik jednostek.
- `Freshness`: data najnowszych danych.
- `Updated`: wzgledny czas ostatniej aktualizacji.
- `Actions`: odswiezenie pojedynczego site.

## Error Handling

- Gdy brak danych, ekran pokazuje prosty stan pusty zgodny z design systemem.
- Gdy trwa pierwsze ladowanie, ekran pokazuje lekkie skeletony lub spinner, bez duzego pustego boxa.
- Wiersze z bledami lub opoznieniami maja pierwszenstwo wizualne przez badge i kolejnosc sortowania, nie przez agresywne kolory tla.

## Testing

- Dodac testy dla summary liczonego defensywnie z kilku pol.
- Dodac testy dla sortowania i opisu stanu.
- Zweryfikowac istniejacy spec komponentu po zmianie prezentacji.
