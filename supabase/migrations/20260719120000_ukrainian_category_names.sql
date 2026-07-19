-- U10: localize category names to Ukrainian for the (Ukrainian-only) UI.
-- Existing aggregate rows already computed under the old English names are
-- remapped in place; the AI agent and dashboard both read `category` as a
-- plain display string, so no other schema changes are needed.

create or replace function public.mcc_to_category(p_mcc integer)
returns text
language sql
immutable
as $$
  select case
    when p_mcc in (5411, 5412, 5422, 5441, 5451, 5462) then 'Продукти'
    when p_mcc between 5811 and 5814 then 'Ресторани та кафе'
    when p_mcc in (4111, 4121, 4131, 4789) then 'Транспорт'
    when p_mcc in (5541, 5542) then 'Пальне'
    when p_mcc in (5311, 5651, 5661, 5691, 5699, 5732, 5733, 5734, 5735, 5945, 5947) then 'Покупки'
    when p_mcc in (4814, 4816, 4899, 4900) then 'Комунальні послуги'
    when p_mcc in (7832, 7841, 7922) then 'Розваги'
    when p_mcc in (5912, 8011, 8021, 8031, 8041, 8042, 8049, 8050, 8062, 8071, 8099) then 'Здоров''я'
    else 'Інше'
  end;
$$;

update public.aggregates set category = case category
  when 'Groceries' then 'Продукти'
  when 'Restaurants & Cafes' then 'Ресторани та кафе'
  when 'Transport' then 'Транспорт'
  when 'Fuel' then 'Пальне'
  when 'Shopping' then 'Покупки'
  when 'Utilities & Bills' then 'Комунальні послуги'
  when 'Entertainment' then 'Розваги'
  when 'Health' then 'Здоров''я'
  when 'Other' then 'Інше'
  else category
end
where category in (
  'Groceries', 'Restaurants & Cafes', 'Transport', 'Fuel', 'Shopping',
  'Utilities & Bills', 'Entertainment', 'Health', 'Other'
);
