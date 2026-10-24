# Testes manuais

Use `?hoje=AAAA-MM-DD` no fim do endereço para simular a data (ex.: `https://amanda-study-app.carloscurioni.workers.dev/?hoje=2026-10-24`).

## Fase 1 — moedas por dia (bug do Matheus)
1. Entre no perfil de um filho com `?hoje=2026-10-24` (sábado, 1º dia do ciclo 24/10–30/10).
2. Anote o saldo 🪙 do topo.
3. Planeje a semana (📝 Minha semana) e abra a tarefa de hoje. Responda tudo e toque em **✔ Concluir**.
   - Esperado: o modal mostra **+10 🪙**, o saldo sobe 10 e o extrato (Área dos pais → Moedas) tem "Tarefa de sábado 24/10".
   - Na tela inicial: "🎁 +100 na sexta 30/10 se completar todos os dias (1 de 7 feitos)".
4. Troque para `?hoje=2026-10-26` e faça a tarefa de domingo 25/10 (atrasada): vale **+5** (metade).
5. Perfil que já tinha concluído um dia antes desta versão (caso do Matheus, sábado 24/10): ao abrir o app, a Lumi avisa "Faltou te dar as moedas…" e credita **+10** uma única vez.

## Fase 1 — dois aparelhos no mesmo perfil
1. Abra o mesmo perfil no celular e no computador.
2. No celular, conclua a tarefa do dia. No computador (sem recarregar), faça uma rodada de extras.
3. Esperado: aparece "🔄 Juntei com as mudanças de outro aparelho" e, depois de recarregar, os dois aparelhos mostram o dia concluído e o saldo com as duas moedas somadas.
