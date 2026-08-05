import {supabase} from './supabase';

export type DeliveryDistanceResult = {
  distanceKm: number;
  durationMinutes: number | null;
  provider: 'mapbox';
};

const friendlyError = (code: string) => {
  if (code === 'DELIVERY_SERVICE_NOT_CONFIGURED') return 'O cálculo automático de entrega ainda não foi configurado.';
  if (code === 'INVALID_ADDRESS' || code === 'ADDRESS_NOT_FOUND') return 'Não foi possível localizar um dos endereços informados.';
  if (code === 'ROUTE_NOT_FOUND') return 'Não foi possível encontrar uma rota entre os endereços.';
  if (code === 'RATE_LIMITED') return 'Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.';
  if (code === 'AUTH_REQUIRED' || code === 'INVALID_SESSION') return 'Sua sessão expirou. Entre novamente para calcular a entrega.';
  return 'Não foi possível calcular a distância agora.';
};

export const requestDeliveryDistance = async (
  origin: string,
  destination: string,
  signal?: AbortSignal,
): Promise<DeliveryDistanceResult> => {
  const {data} = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error(friendlyError('AUTH_REQUIRED'));

  const response = await fetch('/api/delivery-distance', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({origin, destination}),
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(friendlyError(String(body?.error || '')));

  const distanceKm = Number(body?.distanceKm);
  const durationMinutes = body?.durationMinutes == null ? null : Number(body.durationMinutes);
  if (!Number.isFinite(distanceKm) || distanceKm < 0 || distanceKm > 10000) {
    throw new Error(friendlyError('INVALID_DISTANCE'));
  }

  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    durationMinutes: Number.isFinite(durationMinutes) ? Math.max(0, Math.round(durationMinutes)) : null,
    provider: 'mapbox',
  };
};
