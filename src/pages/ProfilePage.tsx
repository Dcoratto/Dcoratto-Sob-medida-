import React, { useState, useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Save, User, Camera, Phone, Briefcase, Mail, Upload } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export const ProfilePage: React.FC = () => {
  const { profile, user } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setPhone(profile.phone || '');
      setPosition(profile.position || '');
      setPhotoUrl(profile.photoUrl || '');
    }
  }, [profile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 800000) { // Check for ~800KB limit for Base64 in Firestore
        alert('A imagem é muito grande. Por favor, escolha uma imagem menor que 800KB.');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setSaving(true);
    try {
      await updateDoc(doc(db, 'profiles', user.uid), {
        name,
        phone,
        position,
        photoUrl,
        updatedAt: new Date()
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error updating profile:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Meu Perfil</h1>
          <p className="text-slate-500 mt-1">Gerencie suas informações pessoais e profissionais.</p>
        </div>
      </header>

      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
        {/* Cover / Header color */}
        <div className="h-32 bg-gradient-to-r from-brand-primary/20 to-brand-primary/5" />
        
        <div className="px-8 pb-8 -mt-12">
          <div className="flex flex-col items-center sm:items-start sm:flex-row gap-6 mb-8">
            <div className="relative group">
              <div className="w-24 h-24 rounded-3xl bg-white p-1 shadow-xl">
                <div className="w-full h-full rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary overflow-hidden shadow-inner">
                  {photoUrl ?(
                    <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-10 h-10" />
                  )}
                </div>
              </div>
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-2 -right-2 w-10 h-10 bg-brand-primary text-white rounded-xl flex items-center justify-center shadow-lg border-4 border-white cursor-pointer hover:scale-110 transition-all z-10"
              >
                <Camera className="w-5 h-5" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
            </div>
            
            <div className="pt-12 text-center sm:text-left">
              <h2 className="text-xl font-bold text-slate-900">{profile?.name || 'Seu Nome'}</h2>
              <p className="text-slate-500">{profile?.email}</p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-wider">
                {profile?.role === 'admin' ?'Administrador' : 'Usuário'}
              </div>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium flex items-center gap-2 text-sm">
                  <User className="w-4 h-4" /> Nome Completo
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                  placeholder="Seu nome"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4" /> Telefone
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium flex items-center gap-2 text-sm">
                  <Briefcase className="w-4 h-4" /> Cargo na Empresa
                </label>
                <input
                  type="text"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                  placeholder="Ex: Vendedor, Medidor..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium flex items-center gap-2 text-sm">
                  <Upload className="w-4 h-4" /> Link ou Base64 da Foto
                </label>
                <input
                  type="text"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                  placeholder="Selecione acima ou cole o link..."
                />
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className={cn(
                  "flex items-center gap-2 px-8 py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50",
                  success ?"bg-green-600 text-white shadow-green-200" : "bg-brand-primary text-white shadow-brand-primary/20"
                )}
              >
                {saving ?(
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    {success ?'Salvo!' : 'Salvar Alterações'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 p-6 rounded-[24px]">
        <div className="flex gap-4">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-blue-900">E-mail de Acesso</h4>
            <p className="text-sm text-blue-700 mt-1">
              O seu e-mail de acesso é <strong>{user?.email}</strong>. 
              Para alterar o e-mail ou a senha, entre em contato com o administrador do sistema.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
