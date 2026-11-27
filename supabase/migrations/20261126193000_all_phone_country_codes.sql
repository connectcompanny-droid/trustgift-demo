alter table public.profile_contacts
  drop constraint if exists profile_contacts_phone_country_code,
  drop constraint if exists profile_contacts_whatsapp_country_code;

alter table public.profile_contacts
  add constraint profile_contacts_phone_country_code check (
    phone_country_code is null or phone_country_code ~ '^\+[1-9][0-9]{0,2}$'
  ),
  add constraint profile_contacts_whatsapp_country_code check (
    whatsapp_country_code is null or whatsapp_country_code ~ '^\+[1-9][0-9]{0,2}$'
  );
