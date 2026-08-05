update public.settings
set payment_methods = '[
  {"name":"A vista (Dinheiro/Pix)","adjustment":-5},
  {"name":"Cartao de Debito","adjustment":0},
  {"name":"CREDITO 1X","adjustment":2.5},
  {"name":"CREDITO 2X","adjustment":3.75},
  {"name":"CREDITO 3X","adjustment":5},
  {"name":"CREDITO 4X","adjustment":6.3},
  {"name":"CREDITO 5X","adjustment":7.6},
  {"name":"CREDITO 6X","adjustment":8.9},
  {"name":"CREDITO 7X","adjustment":10.2},
  {"name":"CREDITO 8X","adjustment":11.5},
  {"name":"CREDITO 9X","adjustment":12.9},
  {"name":"CREDITO 10X","adjustment":14.2},
  {"name":"CREDITO 11X","adjustment":15.6},
  {"name":"CREDITO 12X","adjustment":17}
]'::jsonb
where coalesce(jsonb_array_length(payment_methods), 0) = 0
   or payment_methods = '[
     {"name":"A vista (Dinheiro/Pix)","adjustment":-5},
     {"name":"Cartao de Debito","adjustment":0},
     {"name":"Cartao de Credito 1x","adjustment":3},
     {"name":"Parcelado 10x","adjustment":15}
   ]'::jsonb;
