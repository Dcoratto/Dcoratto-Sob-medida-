insert into public.settings (id, company_name, logo_url, phone, email, address, default_validity, default_notes, labor_rate_per_linear_meter, default_fronton_height, default_skirt_height, default_turn_height, cutout_prices, payment_methods, sculpted_sink_rates, material_catalog)
values
  ('global', 'D’Coratto Sob Medida', null, '(11) 96264-3566', 'wellington@dcoratto.com', 'W.B DE JESUS PLANEJADO E DECORACAO
CNPJ: 32.445.695/0001-01
Estrada da Pedreira , 544
Parquelândia-Mogi das Cruzes-SP', 15, 'Orçamento sujeito a confirmação de medidas no local.', 200, 10, 6, 6, '{"cooktop":60,"sinkUnder":60,"sinkOver":60,"faucetHole":30,"trashBinCutout":60,"popUpTowerCutout":45,"wetAreaAmericanRecess":120,"wetAreaItalianRecess":160,"sinkSculpted":false,"sinkSculptedPrice":200}'::jsonb, '[{"name":"A vista (Dinheiro/Pix)","adjustment":-5},{"name":"Cartao de Debito","adjustment":0},{"name":"Cartao de Credito 1x","adjustment":3},{"name":"Parcelado 10x","adjustment":15}]'::jsonb, '{"simple":200,"ramp":200,"hiddenValve":200,"extraSink":200,"riskPercentage":10}'::jsonb, '{"materialTypes":["Chapa","Lamina"],"naturalThicknesses":["2cm"],"slabThicknesses":["6mm","12mm"],"textures":["Polido","Escovado","Acetinado","Flameado","Fosco","Levigado"],"materialCategories":["Granito","Lâmina Ultracompacta","Mármore","Porcelanato","Quartzito","Quartzo","Superfície Sinterizada"],"suppliers":[{"id":"Estrela do Sul","name":"Estrela do Sul","whatsapp":"28 999232227","contactName":"Luciano Schuina","city":"Cachoeiro De Itapemirim - ES","notes":""},{"id":"Iven Stones","name":"Iven Stones","whatsapp":"11 976169616","contactName":"Sergio Campos","city":"Ipiranga, São Paulo - SP","notes":""},{"id":"MGA","name":"MGA","whatsapp":"28 999476288","contactName":"Fabricio","city":"Cachoeiro De Itapemirim - ES","notes":""},{"id":"MGA (2)","name":"MGA","whatsapp":"28 999215247","contactName":"Mariana","city":"Cachoeiro De Itapemirim - ES","notes":""},{"id":"Phoenix Brasil Stones","name":"Phoenix Brasil Stones","whatsapp":"28 999047874","contactName":"Nicacio Almeida","city":"Cachoeiro De Itapemirim - ES","notes":"Mármores, Quartzitos, Importados, Exóticos e Super exóticos"},{"id":"Qualigran","name":"Qualigran","whatsapp":"28 999114388","contactName":"Ígor Brunhara","city":"Cachoeiro De Itapemirim - ES","notes":"Vendas de Mármores, Granitos,  Quartzitos, Mármores Dolomíticos, Quartzo e Lâminas Ultracompacta"},{"id":"Terlos Stones","name":"Terlos Stones","whatsapp":"28 999596837","contactName":"Edmar","city":"Cachoeiro de Itapemirim - ES","notes":""},{"id":"VR STONE","name":"VR STONE","whatsapp":"28 999781397","contactName":"Marcelo Violante","city":"Cachoeiro De Itapemirim - ES","notes":""}],"materialLines":["Nacional","Importado","Premium","Super Premium"]}'::jsonb)
on conflict (id) do update set
  company_name = excluded.company_name,
  logo_url = excluded.logo_url,
  phone = excluded.phone,
  email = excluded.email,
  address = excluded.address,
  default_validity = excluded.default_validity,
  default_notes = excluded.default_notes,
  labor_rate_per_linear_meter = excluded.labor_rate_per_linear_meter,
  default_fronton_height = excluded.default_fronton_height,
  default_skirt_height = excluded.default_skirt_height,
  default_turn_height = excluded.default_turn_height,
  cutout_prices = excluded.cutout_prices,
  payment_methods = excluded.payment_methods,
  sculpted_sink_rates = excluded.sculpted_sink_rates,
  material_catalog = excluded.material_catalog;
