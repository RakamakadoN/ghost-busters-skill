// Minimal generated-types shape (what `supabase gen types typescript` produces).
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      orders: {
        Row: {
          id: string;
          status: string;
          data: Json | null;
          customer_id: string | null;
        };
        Insert: { id?: string; status: string };
        Update: { status?: string };
      };
      customers: {
        Row: {
          id: string;
          name: string;
        };
        Insert: { name: string };
        Update: { name?: string };
      };
    };
    Views: {
      v_orders: {
        Row: {
          id: string;
          total: number;
        };
      };
    };
  };
};
