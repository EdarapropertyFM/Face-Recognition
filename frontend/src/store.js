// Legacy demo data retained only for screens that have not yet moved to live APIs.
// All components import from here so data is consistent across pages.

export const NOW = new Date("2026-09-16T10:00:00");

export const ZONES = [
  ["Residential — North", "سكني - شمال"],
  ["Residential — South", "سكني - جنوب"],
  ["Commercial Plaza", "مركز تجاري"],
  ["Main Gate", "البوابة الرئيسية"],
  ["Clubhouse", "النادي"],
  ["Parking B2", "جراج ب٢"],
];

export const SEF_FORMS = {
  "SEF-01-01": ["Incident Capture Acknowledgment", "اقرار ضبط واقعة"],
  "SEF-01-02": ["Ban Acknowledgment", "اقرار منع"],
  "SEF-01-18": ["Damage / Destruction Record", "محضر اتلاف"],
  "SEF-01-20": ["Incident Proof Record", "محضر اثبات واقعة"],
};

export const WTR_BUILDINGS = [
  { code: "WTR-B1", name: ["Building 1", "مبنى ١"], units: 24, cams: 8, enrolled: 18, strangersToday: 1 },
  { code: "WTR-B2", name: ["Building 2", "مبنى ٢"], units: 24, cams: 8, enrolled: 21, strangersToday: 0 },
  { code: "WTR-B3", name: ["Building 3", "مبنى ٣"], units: 18, cams: 6, enrolled: 12, strangersToday: 0 },
  { code: "WTR-B4", name: ["Building 4", "مبنى ٤"], units: 18, cams: 6, enrolled: 9,  strangersToday: 0 },
  { code: "WTR-B5", name: ["Building 5", "مبنى ٥"], units: 30, cams: 10, enrolled: 24, strangersToday: 2 },
  { code: "WTR-B6", name: ["Building 6", "مبنى ٦"], units: 30, cams: 10, enrolled: 20, strangersToday: 0 },
];

export const FACES = [
  { id: "F-0001", name: ["Ahmed Kamal",      "أحمد كمال"],       type: "known",   role: ["Owner · WTR B1-0101","مالك · WTR B1-0101"],       idno: "288...", issuer: "Cairo",  enroll: "2026-02-11", img: null, bldg: "WTR-B1", unit: "B1-0101" },
  { id: "F-0002", name: ["Mona Saleh",        "منى صالح"],        type: "known",   role: ["Owner · WTR B2-0203","مالك · WTR B2-0203"],       idno: "290...", issuer: "Giza",   enroll: "2026-03-02", img: null, bldg: "WTR-B2", unit: "B2-0203" },
  { id: "F-0003", name: ["Security Officer 12","ضابط أمن ١٢"],   type: "staff",   role: ["Guard · Main Gate",  "حارس · البوابة"],           idno: "EMP-0912", issuer: "STMC", enroll: "2026-01-20", img: null, bldg: "—", unit: "—" },
  { id: "F-0004", name: ["Housekeeping — Sara","خدمة - سارة"],   type: "staff",   role: ["Staff · Clubhouse",  "موظف · النادي"],            idno: "EMP-1140", issuer: "STMC", enroll: "2026-01-22", img: null, bldg: "—", unit: "—" },
  { id: "F-0087", name: ["Stranger",           "غريب"],           type: "unknown", role: ["Seen at WTR B1 entrance","ظهر عند مدخل WTR B1"], idno: "—", issuer: "—", enroll: "2026-09-15", img: null, bldg: "WTR-B1", unit: "—" },
  { id: "F-0091", name: ["Stranger",           "غريب"],           type: "unknown", role: ["Seen at WTR B5 entrance","ظهر عند مدخل WTR B5"], idno: "—", issuer: "—", enroll: "2026-09-16", img: null, bldg: "WTR-B5", unit: "—" },
  { id: "F-0044", name: ["Khaled Nabil",        "خالد نبيل"],     type: "watch",   role: ["BANNED · Trespass",  "محظور · تعدٍّ"],           idno: "301...", issuer: "Cairo",  enroll: "2026-08-30", img: null, ban: "SEF-01-02", bldg: "WTR-B2", unit: "—" },
  { id: "F-0052", name: ["Visitor — flagged",   "زائر - مُعلَّم"], type: "watch",   role: ["BANNED · Vandalism", "محظور · إتلاف"],          idno: "—",     issuer: "—",      enroll: "2026-09-10", img: null, ban: "SEF-01-02", bldg: "—",      unit: "—" },
];

function fmt(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Build detections from a simulation plan
const DETECTION_PLAN = [
  ["F-0044", [[3,19,96],[0,64,93],[2,140,95],[3,320,90]]],
  ["F-0087", [[3,48,91],[2,55,90],[4,72,89],[2,180,86],[0,240,84],[3,300,88]]],
  ["F-0052", [[4,90,88],[3,150,85],[2,610,83]]],
  ["F-0091", [[5,25,84],[5,110,82],[1,200,80]]],
  ["F-0001", [[0,30,98],[2,120,96],[0,400,97]]],
  ["F-0002", [[1,45,95],[1,260,94]]],
  ["F-0003", [[3,10,99],[3,130,99],[0,290,98]]],
  ["F-0004", [[4,60,97],[4,350,96]]],
];

const rawDetections = [];
DETECTION_PLAN.forEach(([fid, evs]) => {
  const f = FACES.find(x => x.id === fid);
  evs.forEach((e, i) => {
    const d = new Date(NOW - e[1] * 60000);
    rawDetections.push({
      face: fid, zone: e[0], conf: e[2], type: f.type,
      cam: "CAM-" + ZONES[e[0]][0].split(" ")[0] + "-" + (10 + i),
      when: fmt(d), ts: d.getTime(),
    });
  });
});
export const DETECTIONS = rawDetections.sort((a, b) => b.ts - a.ts);

export const CAMERAS = [
  ["Gate-03", 3, "online", 2], ["Gate-01", 3, "online", 5],
  ["Plaza-11", 2, "online", 9], ["Plaza-07", 2, "online", 1],
  ["Res-N-22", 0, "online", 4], ["Res-N-05", 0, "offline", 0],
  ["Res-S-08", 1, "online", 3], ["Res-S-14", 1, "online", 0],
  ["Club-04", 4, "online", 6], ["Club-09", 4, "offline", 0],
  ["Park-B2-06", 5, "online", 2], ["Park-B2-11", 5, "online", 1],
  ["Gate-02", 3, "online", 7], ["Plaza-03", 2, "online", 2],
  ["Res-N-18", 0, "online", 1], ["Park-B2-02", 5, "online", 0],
].map(([nm, z, st, d]) => ({
  id: "CAM-" + nm, zone: z, status: st, det: d,
  last: st === "online" ? fmt(NOW) : "2026-09-16 07:12",
}));

export const CAMERAS_TOTAL = 1000;
export const CAMERAS_ONLINE = 987;

export const ALERTS = [
  { id: "A1", face: "F-0044", cam: "CAM-Gate-03", zone: 3, when: "2026-09-16 09:41", conf: 96, status: "new",      log: [] },
  { id: "A2", face: "F-0087", cam: "CAM-Plaza-11", zone: 2, when: "2026-09-16 09:12", conf: 91, status: "new",      log: [] },
  { id: "A3", face: "F-0052", cam: "CAM-Club-04",  zone: 4, when: "2026-09-15 20:30", conf: 88, status: "resolved", log: [["Officer 07","ACK","20:33"],["Officer 07","RESOLVED","20:51"]] },
];

export const INCIDENTS = [
  { id: "INC-2041", sef: "SEF-01-20", title: ["Trespass — restricted zone","تعدٍّ - منطقة محظورة"],      face: "F-0087", zone: 3, when: "2026-09-15 22:14", officer: ["Officer 12","ضابط ١٢"],   status: "open",   desc: ["Subject entered pool deck after hours.","دخل الشخص منطقة المسبح بعد ساعات العمل."], att: [] },
  { id: "INC-2039", sef: "SEF-01-01", title: ["Altercation with guard","مشادة مع الحارس"],              face: "F-0044", zone: 3, when: "2026-09-14 18:40", officer: ["Officer 07","ضابط ٧"],    status: "review", desc: ["Verbal altercation at gate; ID captured.","مشادة كلامية عند البوابة."], att: [] },
  { id: "INC-2035", sef: "SEF-01-18", title: ["Property damage — clubhouse","إتلاف ممتلكات - النادي"],  face: "F-0052", zone: 4, when: "2026-09-10 15:05", officer: ["Officer 03","ضابط ٣"],    status: "closed", desc: ["Broken glass door, cost estimated.","كسر باب زجاجي."], att: [] },
  { id: "INC-2033", sef: "SEF-01-02", title: ["Ban issued — repeat trespass","إصدار منع - تكرار تعدٍّ"], face: "F-0044", zone: 3, when: "2026-08-30 11:00", officer: ["Security Mgr","مدير الأمن"], status: "closed", desc: ["Ban acknowledgment signed.","تم توقيع إقرار المنع."], att: [] },
];

export const PENDING_ENROLLMENTS = [
  {
    ref: "WTR-100231", schema: "wtr.enroll.v1", status: "pending", building: "WTR-B1", unit: "B1-0102", submittedAt: "2026-09-16 09:20",
    owner: { name: "Youssef Adel", nid: "29001...", mobile: "0101...", idDoc: null, faces: { front: null, left: null, right: null } },
    family: [{ name: "Layla Adel", relation: "spouse", faces: { front: null } }, { name: "Omar Adel", relation: "son", faces: { front: null } }],
    cars: [{ plate: "P-3345", color: "white", make: "Hyundai Tucson" }],
  },
  {
    ref: "WTR-100248", schema: "wtr.enroll.v1", status: "pending", building: "WTR-B5", unit: "B5-0405", submittedAt: "2026-09-16 09:47",
    owner: { name: "Nour Hassan", nid: "29105...", mobile: "0122...", idDoc: null, faces: { front: null, left: null, right: null } },
    family: [],
    cars: [{ plate: "L-7788", color: "black", make: "Kia Sportage" }],
  },
];

export const USERS = [
  { u: "m.beltagy",  name: ["Mohamed Beltagy","محمد بلتاجي"],    role: "Admin",        status: "active" },
  { u: "sup.west",   name: ["West Supervisor", "مشرف الغرب"],    role: "Supervisor",   status: "active" },
  { u: "op.shiftA",  name: ["Operator Shift A","مشغّل وردية أ"], role: "Operator",     status: "active" },
  { u: "inv.cases",  name: ["Case Investigator","محقق القضايا"],  role: "Investigator", status: "active" },
  { u: "view.mgmt",  name: ["Management Viewer","مشاهدة الإدارة"], role: "Viewer",     status: "inactive" },
];

export const ROLES = {
  Admin:        { view: ["dashboard","livewall","cameras","buildings","enrollments","alerts","track","facedb","incidents","reports","admin","settings","facetest"], edit: ["dashboard","livewall","cameras","buildings","enrollments","alerts","track","facedb","incidents","reports","admin","settings","facetest"] },
  Supervisor:   { view: ["dashboard","livewall","cameras","buildings","enrollments","alerts","track","facedb","incidents","reports","settings"], edit: ["alerts","facedb","incidents","enrollments"] },
  Operator:     { view: ["dashboard","livewall","cameras","buildings","enrollments","alerts","track","facedb","incidents"], edit: ["alerts","incidents"] },
  Investigator: { view: ["dashboard","buildings","track","facedb","incidents","reports"], edit: ["incidents"] },
  Viewer:       { view: ["dashboard","livewall","cameras","buildings","reports"], edit: [] },
};

export const LIVE_CAM_BOXES = {
  "CAM-Gate-03":   [{ cls: "watch",   x: 38, y: 30, label: "F-0044 96%", face: "F-0044" }],
  "CAM-Plaza-11":  [{ cls: "unknown", x: 52, y: 40, label: "F-0087 91%", face: "F-0087" }],
  "CAM-Res-N-22":  [{ cls: "known",   x: 30, y: 34, label: "Ahmed 98%",  face: "F-0001" }, { cls: "known", x: 60, y: 44, label: "Mona 95%", face: "F-0002" }],
  "CAM-Res-S-08":  [{ cls: "known",   x: 44, y: 38, label: "Owner 97%",  face: "F-0001" }],
  "CAM-Club-04":   [{ cls: "watch",   x: 50, y: 36, label: "F-0052 88%", face: "F-0052" }],
  "CAM-Park-B2-06":[{ cls: "unknown", x: 46, y: 42, label: "F-0091 84%", face: "F-0091" }],
  "CAM-Gate-01":   [{ cls: "staff",   x: 40, y: 32, label: "Guard 99%",  face: "F-0003" }],
};

export const SETTINGS_DEFAULT = {
  threshold: 85, retStd: 90, retInc: 1095, retLog: 2555,
  alertOwners: false, alertStrangers: false, alertWatch: true, autoEnrollStrangers: true,
};
