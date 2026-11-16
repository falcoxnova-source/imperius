/*
  Imperium: el boton "Quitar foto de perfil" no borraba el archivo.

  El trigger storage.protect_delete solo permite DELETE en storage.objects si
  storage.allow_delete_query = 'true'. Las versiones nuevas de storage-api lo
  activan por consulta, pero la imagen usada (storage-api v0.46.4) no, asi que
  todos los borrados via Storage API fallaban.

  Se activa solo para el rol con el que se conecta storage-api. Los borrados
  siguen sujetos a las politicas RLS (cada usuario solo borra lo suyo) y los
  DELETE directos por otras vias (PostgREST, etc.) siguen bloqueados.
  Requiere reiniciar imperium-storage para que tome el valor.
*/
ALTER ROLE supabase_storage_admin SET storage.allow_delete_query = 'true';
