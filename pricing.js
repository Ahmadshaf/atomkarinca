window.EVA_PRICING = {
  propertyBase: {
    "Ev": 0,
    "Boş daire": 6500,
    "Villa": 10000,
    "Ofis": 7000,
    "Diğer": 6000,
    "Koltuk temizliği": 1500
  },
  roomAdd: {
    "1+0": 0,
    "1+1": 6500,
    "2+1": 7500,
    "3+1": 8500,
    "4+1": 10000,
    "4+1 Dubleks": 14000,
    "5+1 veya büyük": 6000
  },
  serviceAdd: {
    "Standart ev temizliği": 0,
    "Detaylı temizlik": 2500,
    "Taşınma / inşaat sonrası": 4000
  },
  // 2+1, 3+1, 4+1 (ve dubleks) için 1'den fazla her banyo +500 TL
  bathroomExtraRooms: ["2+1", "3+1", "4+1", "4+1 Dubleks"],
  bathroomExtraFee: 500,
  areaAdd(m2, propertyType) {
    const n = Number(m2 || 0);
    if (!n) return 0;
    if (propertyType === "Koltuk temizliği") return 0;

    if (propertyType === "Villa") {
      if (n <= 100) return 0;
      if (n <= 150) return 2500;
      if (n <= 200) return 5000;
      return 8000;
    }

    if (propertyType === "Ofis") {
      if (n <= 100) return 0;
      if (n <= 200) return 3000;
      return 7000;
    }

    if (n <= 100) return 0;
    if (n <= 150) return 1500;
    if (n <= 200) return 3000;
    return 5000;
  }
};

window.calculateEvaPrice = function(propertyType, roomCount, serviceType, squareMeters, bathroomCount) {
  const p = window.EVA_PRICING;

  // Koltuk temizliği ayrı yer: sabit/taban fiyat
  if (propertyType === "Koltuk temizliği") {
    const base = p.propertyBase["Koltuk temizliği"] ?? 1500;
    return { total: base, base, room: 0, service: 0, area: 0, bathroom: 0 };
  }

  const base = p.propertyBase[propertyType] ?? 5000;
  const room = p.roomAdd[roomCount] ?? 0;
  const service = p.serviceAdd[serviceType] ?? 0;
  const area = p.areaAdd(squareMeters, propertyType);

  let bathroom = 0;
  const baths = Math.max(1, Number(bathroomCount) || 1);
  if (p.bathroomExtraRooms.includes(roomCount) && baths > 1) {
    bathroom = (baths - 1) * (p.bathroomExtraFee || 500);
  }

  return {
    total: base + room + service + area + bathroom,
    base,
    room,
    service,
    area,
    bathroom
  };
};

window.formatTL = value =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
