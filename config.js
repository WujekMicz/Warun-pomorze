/* Uzupełnij po założeniu projektu w Supabase (Project Settings → API Keys).
   Klucz „publishable” (dawniej „anon”) jest z założenia publiczny – dostęp do danych pilnują reguły w bazie.
   Bez tych wartości strona działa z samymi presetami EN-A / EN-B / Parakite. */
window.WARUN_CONFIG = {
  supabaseUrl: "https://wbqgzisqmyrpcckiquss.supabase.co",
  supabaseAnonKey: "sb_publishable_BuU5hjrmCGYTHGXeupnF_Q_EJ_hnVkG",
  loginDomain: "warun.invalid"   // login „jan” = konto jan@warun.invalid; musi być takie samo w admin.py
};
