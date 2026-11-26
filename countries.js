(() => {
  // ISO 3166-1 alpha-2 code and international calling code.
  const entries = ("AF93 AL355 DZ213 AD376 AO244 AG1 AR54 AM374 AU61 AT43 AZ994 BS1 BH973 BD880 BB1 BY375 BE32 BZ501 BJ229 "
    + "BT975 BO591 BA387 BW267 BR55 BN673 BG359 BF226 BI257 CV238 KH855 CM237 CA1 CF236 TD235 CL56 CN86 CO57 KM269 CG242 "
    + "CD243 CR506 CI225 HR385 CU53 CY357 CZ420 DK45 DJ253 DM1 DO1 EC593 EG20 SV503 GQ240 ER291 EE372 SZ268 ET251 FJ679 "
    + "FI358 FR33 GA241 GM220 GE995 DE49 GH233 GR30 GD1 GT502 GN224 GW245 GY592 HT509 HN504 HK852 HU36 IS354 IN91 ID62 "
    + "IR98 IQ964 IE353 IL972 IT39 JM1 JP81 JO962 KZ7 KE254 KI686 KP850 KR82 XK383 KW965 KG996 LA856 LV371 LB961 LS266 "
    + "LR231 LY218 LI423 LT370 LU352 MO853 MG261 MW265 MY60 MV960 ML223 MT356 MH692 MR222 MU230 MX52 FM691 MD373 MC377 "
    + "MN976 ME382 MA212 MZ258 MM95 NA264 NR674 NP977 NL31 NZ64 NI505 NE227 NG234 MK389 NO47 OM968 PK92 PW680 PS970 PA507 "
    + "PG675 PY595 PE51 PH63 PL48 PT351 PR1 QA974 RO40 RU7 RW250 KN1 LC1 VC1 WS685 SM378 ST239 SA966 SN221 RS381 SC248 "
    + "SL232 SG65 SK421 SI386 SB677 SO252 ZA27 SS211 ES34 LK94 SD249 SR597 SE46 CH41 SY963 TW886 TJ992 TZ255 TH66 TL670 "
    + "TG228 TO676 TT1 TN216 TR90 TM993 TV688 UG256 UA380 AE971 GB44 US1 UY598 UZ998 VU678 VA39 VE58 VN84 YE967 ZM260 ZW263")
    .split(" ")
    .map(entry => ({ iso: entry.slice(0, 2), dial: `+${entry.slice(2)}` }));

  // Stored profile values are English names. They are fixed here so they do not
  // vary with the visitor's browser, and match the values already saved.
  const names = {"AF":"Afghanistan","AL":"Albania","DZ":"Algeria","AD":"Andorra","AO":"Angola","AG":"Antigua & Barbuda","AR":"Argentina","AM":"Armenia","AU":"Australia","AT":"Austria","AZ":"Azerbaijan","BS":"Bahamas","BH":"Bahrain","BD":"Bangladesh","BB":"Barbados","BY":"Belarus","BE":"Belgium","BZ":"Belize","BJ":"Benin","BT":"Bhutan","BO":"Bolivia","BA":"Bosnia & Herzegovina","BW":"Botswana","BR":"Brazil","BN":"Brunei","BG":"Bulgaria","BF":"Burkina Faso","BI":"Burundi","CV":"Cape Verde","KH":"Cambodia","CM":"Cameroon","CA":"Canada","CF":"Central African Republic","TD":"Chad","CL":"Chile","CN":"China","CO":"Colombia","KM":"Comoros","CG":"Congo - Brazzaville","CD":"Congo - Kinshasa","CR":"Costa Rica","CI":"Côte d’Ivoire","HR":"Croatia","CU":"Cuba","CY":"Cyprus","CZ":"Czechia","DK":"Denmark","DJ":"Djibouti","DM":"Dominica","DO":"Dominican Republic","EC":"Ecuador","EG":"Egypt","SV":"El Salvador","GQ":"Equatorial Guinea","ER":"Eritrea","EE":"Estonia","SZ":"Eswatini","ET":"Ethiopia","FJ":"Fiji","FI":"Finland","FR":"France","GA":"Gabon","GM":"Gambia","GE":"Georgia","DE":"Germany","GH":"Ghana","GR":"Greece","GD":"Grenada","GT":"Guatemala","GN":"Guinea","GW":"Guinea-Bissau","GY":"Guyana","HT":"Haiti","HN":"Honduras","HK":"Hong Kong SAR China","HU":"Hungary","IS":"Iceland","IN":"India","ID":"Indonesia","IR":"Iran","IQ":"Iraq","IE":"Ireland","IL":"Israel","IT":"Italy","JM":"Jamaica","JP":"Japan","JO":"Jordan","KZ":"Kazakhstan","KE":"Kenya","KI":"Kiribati","KP":"North Korea","KR":"South Korea","XK":"Kosovo","KW":"Kuwait","KG":"Kyrgyzstan","LA":"Laos","LV":"Latvia","LB":"Lebanon","LS":"Lesotho","LR":"Liberia","LY":"Libya","LI":"Liechtenstein","LT":"Lithuania","LU":"Luxembourg","MO":"Macao SAR China","MG":"Madagascar","MW":"Malawi","MY":"Malaysia","MV":"Maldives","ML":"Mali","MT":"Malta","MH":"Marshall Islands","MR":"Mauritania","MU":"Mauritius","MX":"Mexico","FM":"Micronesia","MD":"Moldova","MC":"Monaco","MN":"Mongolia","ME":"Montenegro","MA":"Morocco","MZ":"Mozambique","MM":"Myanmar (Burma)","NA":"Namibia","NR":"Nauru","NP":"Nepal","NL":"Netherlands","NZ":"New Zealand","NI":"Nicaragua","NE":"Niger","NG":"Nigeria","MK":"North Macedonia","NO":"Norway","OM":"Oman","PK":"Pakistan","PW":"Palau","PS":"Palestinian Territories","PA":"Panama","PG":"Papua New Guinea","PY":"Paraguay","PE":"Peru","PH":"Philippines","PL":"Poland","PT":"Portugal","PR":"Puerto Rico","QA":"Qatar","RO":"Romania","RU":"Russia","RW":"Rwanda","KN":"St. Kitts & Nevis","LC":"St. Lucia","VC":"St. Vincent & Grenadines","WS":"Samoa","SM":"San Marino","ST":"São Tomé & Príncipe","SA":"Saudi Arabia","SN":"Senegal","RS":"Serbia","SC":"Seychelles","SL":"Sierra Leone","SG":"Singapore","SK":"Slovakia","SI":"Slovenia","SB":"Solomon Islands","SO":"Somalia","ZA":"South Africa","SS":"South Sudan","ES":"Spain","LK":"Sri Lanka","SD":"Sudan","SR":"Suriname","SE":"Sweden","CH":"Switzerland","SY":"Syria","TW":"Taiwan","TJ":"Tajikistan","TZ":"Tanzania","TH":"Thailand","TL":"Timor-Leste","TG":"Togo","TO":"Tonga","TT":"Trinidad & Tobago","TN":"Tunisia","TR":"Türkiye","TM":"Turkmenistan","TV":"Tuvalu","UG":"Uganda","UA":"Ukraine","AE":"United Arab Emirates","GB":"United Kingdom","US":"United States","UY":"Uruguay","UZ":"Uzbekistan","VU":"Vanuatu","VA":"Vatican City","VE":"Venezuela","VN":"Vietnam","YE":"Yemen","ZM":"Zambia","ZW":"Zimbabwe"};
  const countries = entries.map(entry => ({ ...entry, name: names[entry.iso] }));
  const dialCodes = [...new Set(countries.map(country => country.dial))]
    .sort((a, b) => Number(a) - Number(b));

  const countrySelects = document.querySelectorAll("#country-select, #profile-country");
  const dialSelects = document.querySelectorAll('select[name="phoneCountry"], select[name="whatsappCountry"]');

  function renderCountries() {
    const locale = window.TRUSTGIFT_I18N?.getLocale() ?? "en";
    const displayNames = new Intl.DisplayNames([locale], { type: "region" });
    const localized = countries
      .map(country => ({
        value: country.name,
        label: locale.startsWith("en") ? country.name : displayNames.of(country.iso)
      }))
      .sort((a, b) => a.label.localeCompare(b.label, locale));

    countrySelects.forEach(select => {
      const selected = select.value;
      const placeholder = select.querySelector('option[value=""]');
      const options = localized.map(({ value, label }) => {
        const option = new Option(label, value);
        option.dataset.i18nIgnore = "";
        return option;
      });
      select.replaceChildren(...(placeholder ? [placeholder] : []), ...options);
      select.value = selected;
    });
  }

  dialSelects.forEach(select => {
    const selected = select.value;
    const placeholder = select.querySelector('option[value=""]');
    select.replaceChildren(...(placeholder ? [placeholder] : []), ...dialCodes.map(code => new Option(code, code)));
    select.value = selected;
  });
  renderCountries();
  document.addEventListener("trustgift-language-change", renderCountries);

  window.TRUSTGIFT_COUNTRIES = {
    isoFor: name => countries.find(country => country.name === name)?.iso ?? ""
  };
})();
