# Rapport : contexte, quotas et tokens sur l'écran (branche `agent-gadget-usage`)

Exécuté le 2026-11-08/09 dans cette session (plan `docs/superpowers/plans/2026-11-08-usage-display.md`), en direct.

## Fait

- T1 `scripts/transcript_usage.py` : lecture incrémentale des transcripts (tokens par `message.id` unique, contexte du
  dernier message, titre `custom-title` / `ai-title`). 10 tests.
- T2 `notify.py` : chaque event porte `tok` ; ceux du lead portent aussi `stok`, `ctx_k`, `ctx_pct` et `title`.
  Constat vérifié sur un vrai dump : dans un sous-agent, `transcript_path` est celui du lead (noté dans `docs/hook-payloads.md`).
  Environ 200 ms par hook sur un transcript de 28 Mo.
- T3 `scripts/statusline.py` : status line qui poste `/usage` (contexte, quotas 5 h et 7 j, rythme %/h, projection à
  la réinitialisation, temps avant épuisement). Historique partagé dans `<temp>/agent-gadget-plugin/quota_history.json`.
- T4 firmware : `/usage`, contexte par session (la status line gagne pendant 120 s), tokens par agent et par session,
  titre, quotas dans `/state`.
- T5 écran : onglets à largeur partagée (434, 215, 142, 105, 83 px) avec le titre de session et le remplissage de contexte
  (vert < 50 %, orange < 80 %, rouge ensuite) ; zone droite `+N` et `N!` ; tokens dans le bandeau ; ligne de quotas
  permanente, couleur selon la projection (vert < 85 %, orange 85 à 100 %, rouge au-delà), trait de projection sur la barre.
- T6 docs (`ARCHITECTURE.md`, `CLAUDE.md`, README du plugin), `scenario.py` alimente les nouvelles zones.
- Revue de branche par un relecteur séparé : 0 critique, 3 importants corrigés (voir plus bas), 7 mineurs reportés.

## Tests

- Plugin : `python -m unittest discover -s claude-plugin/agent-gadget/tests`, 58 tests OK.
- Firmware : les 4 envs compilent (`esp32dev`, `esp32dev_test`, `esp32dev_test_screen`, `esp32dev_noscreen`).
- Appareil : `test_usage.py` 9/9, `test_layout.py` + `test_touch.py` 17/17 (`esp32dev_test`), `test_budget.py` 2/2
  (`esp32dev_test_screen`). Suite complète : 49 tests, seules erreurs = timeouts Wi-Fi (RSSI -75 dBm, pas de redémarrage),
  fichiers concernés relancés au vert.
- L'ESP32 tourne maintenant `esp32dev` de cette branche, rempli par `scenario.py`.

## Corrections après revue

1. Un post de quotas redessinait tout le bandeau (clignotement à chaque post) : la ligne de quotas se met à jour par
   le rafraîchissement de 2 s, et la révision ne bouge que si un chiffre affiché change.
2. L'écran vide se redessinait à chaque post : seule la ligne de quotas est rafraîchie, toutes les 2 s.
3. À 100 % de quota, la ligne affichait « empty 0m » : elle affiche maintenant l'heure de réinitialisation, en rouge.
Ces trois corrections touchent le dessin : pas de test automatique possible, vérifiées par compilation et sur l'appareil.

## Mineurs reportés (à décider)

- La ligne de quotas est effacée puis redessinée toutes les 2 s : petit scintillement possible.
- Fichiers temporaires `.tmp` partagés entre hooks parallèles (risque de cache corrompu, surtout hors Windows).
- Un transcript connu qui prend plus de 4 Mo de retard perd les tokens du milieu.
- `statusline.py` écrit son marqueur avant le POST : un POST annulé n'est pas retenté avant 60 s.
- À 100 % de contexte, le remplissage cache la couleur de l'onglet sélectionné.
- Fichiers `*.tok.json` et `*.usage` jamais purgés.
- Un échantillon d'historique corrompu (horodatage non numérique) vide la status line jusqu'à suppression du fichier.

## À faire avec toi

1. Regarder l'écran : lisibilité du texte sur les 3 couleurs de remplissage, et vérifier que `xstr` en mode `sta=3`
   (texte sans fond, jamais testé sur cet écran) s'affiche bien. Sinon : ajuster `C_FILL_*` dans `ui_theme.h`.
2. Installer la status line dans `~/.claude/settings.json` (extrait dans `claude-plugin/agent-gadget/README.md`),
   ouvrir une session `claude` en terminal, vérifier la ligne de quotas.
3. Fusionner avec `agent-gadget-ui` (conflits attendus dans `net.cpp`, `ARCHITECTURE.md`, `CLAUDE.md`). Le plugin
   tourne en direct depuis le dossier principal : les nouveaux champs n'arrivent qu'après la fusion.
