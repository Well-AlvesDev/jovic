
const SUPABASE_CONFIG = {
    url: 'https://hovfcntzthahwszjaxsw.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvdmZjbnR6dGhhaHdzempheHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMDgxNDUsImV4cCI6MjA5Mzc4NDE0NX0.Pss5O_ykTybPUsuZCCln72Pq5dkTGMQ1G1kXR4HOVyw',
    table: 'j-box',
    mercadoPagoPublicKey: 'APP_USR-5ed03b8e-6722-4f6b-b4e0-38928247d437',
    pixCheckoutUrl: 'https://hovfcntzthahwszjaxsw.supabase.co/functions/v1/pix-checkout',
    cardCheckoutUrl: 'https://hovfcntzthahwszjaxsw.supabase.co/functions/v1/card-checkout',
    cardInstallmentsUrl: 'https://hovfcntzthahwszjaxsw.supabase.co/functions/v1/card-installments'
};

if (typeof window !== 'undefined') {
    window.SUPABASE_CONFIG = SUPABASE_CONFIG;
}

export { SUPABASE_CONFIG };
export default SUPABASE_CONFIG;
