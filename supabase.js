// =====================================================
// SUPABASE CLIENT
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://leksemdifenhfvfafcqa.supabase.co";
// This is the public anon key - safe to expose in client-side code
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxla3NlbWRpZmVuaGZ2ZmFmY3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNzk3MjIsImV4cCI6MjA4NDg1NTcyMn0.hpa7L5oqxgn2u2PIk4F0UfRTKWpB07MYOa7uyjPJE-Y";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
