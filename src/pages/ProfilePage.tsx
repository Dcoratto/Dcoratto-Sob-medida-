import React, {useEffect, useRef, useState} from 'react';
import {doc, setDoc, updateDoc} from '../lib/firestore';
import {db} from '../lib/firebase';
import {useAuth} from '../contexts/AuthContext';
import {Briefcase, Camera, Mail, Phone, Save, Upload, User} from 'lucide-react';
import {cn} from '../lib/utils';
import {roleLabel} from '../lib/permissions';

export const ProfilePage: React.FC = () => {
  const {profile, accessUser, user, appUid} = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name || accessUser?.nome || '');
    setPhone(profile.phone || '');
    setPosition(profile.position || '');
    setPhotoUrl(profile.photoUrl || '');
  }, [accessUser?.nome, profile]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 800000) {
      alert('A imagem e muito grande. Escolha uma imagem menor que 800KB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoUrl(String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !appUid) return;

    const nextName = name.trim() || accessUser?.nome || profile?.name || user.email?.split('@')[0] || 'Usuário';

    setSaving(true);
    try {
      await updateDoc(doc(db, 'profiles', appUid), {
        name: nextName,
        phone,
        position,
        photoUrl,
        updatedAt: new Date(),
      });

      await setDoc(doc(db, 'users', appUid), {
        uid: appUid,
        nome: nextName,
        name: nextName,
        email: user.email || '',
        updatedAt: new Date(),
      }, {merge: true});

      setName(nextName);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setSaving(false);
    }
  };

  const displayRole = position || (accessUser?.role ?roleLabel(accessUser.role) : profile?.role === 'admin' ?'Administrador' : 'Usuário');

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-20">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-slate-900">Meu Perfil</h1>
          <p className="mt-1 text-slate-500">Gerencie suas informacoes pessoais e profissionais.</p>
        </div>
      </header>

      <div className="overflow-hidden rounded-[32px] border border-slate-100 bg-white shadow-sm">
        <div className="h-32 bg-gradient-to-r from-brand-primary/20 to-brand-primary/5" />

        <div className="-mt-12 px-8 pb-8">
          <div className="mb-8 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <div className="group relative">
              <div className="h-24 w-24 rounded-3xl bg-white p-1 shadow-xl">
                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-brand-primary/10 text-brand-primary shadow-inner">
                  {photoUrl ?(
                    <img src={photoUrl} alt={name || 'Perfil'} className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-10 w-10" />
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-2 -right-2 z-10 flex h-10 w-10 items-center justify-center rounded-xl border-4 border-white bg-brand-primary text-white shadow-lg transition-all hover:scale-110"
              >
                <Camera className="h-5 w-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <div className="pt-12 text-center sm:text-left">
              <h2 className="text-xl font-bold text-slate-900">{profile?.name || accessUser?.nome || 'Seu nome'}</h2>
              <p className="text-slate-500">{profile?.email}</p>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-slate-600">
                {displayRole}
              </div>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <User className="h-4 w-4" /> Nome completo
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Seu nome"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 font-medium outline-none transition-all focus:ring-2 focus:ring-brand-primary/20"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <Phone className="h-4 w-4" /> Telefone
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="(00) 00000-0000"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 font-medium outline-none transition-all focus:ring-2 focus:ring-brand-primary/20"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <Briefcase className="h-4 w-4" /> Cargo na empresa
                </label>
                <input
                  type="text"
                  value={position}
                  onChange={(event) => setPosition(event.target.value)}
                  placeholder="Ex: Vendedor, Medidor..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 font-medium outline-none transition-all focus:ring-2 focus:ring-brand-primary/20"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <Upload className="h-4 w-4" /> Foto de perfil
                </label>
                <input
                  type="text"
                  readOnly
                  value={photoUrl ?'Foto selecionada do computador' : ''}
                  placeholder="Selecione a foto pelo botao da camera"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 font-medium outline-none transition-all focus:ring-2 focus:ring-brand-primary/20"
                />
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-6">
              <button
                type="submit"
                disabled={saving}
                className={cn(
                  'flex items-center gap-2 rounded-2xl px-8 py-3 font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50',
                  success ?'bg-green-600 text-white shadow-green-200' : 'bg-brand-primary text-white shadow-brand-primary/20',
                )}
              >
                {saving ?(
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <>
                    <Save className="h-5 w-5" />
                    {success ?'Salvo!' : 'Salvar alteracoes'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="rounded-[24px] border border-blue-100 bg-blue-50 p-6">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-bold text-blue-900">E-mail de acesso</h4>
            <p className="mt-1 text-sm text-blue-700">
              O seu e-mail de acesso e <strong>{user?.email}</strong>. Para alterar e-mail ou senha, fale com o administrador do sistema.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
