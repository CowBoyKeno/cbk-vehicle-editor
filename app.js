'use strict';

/* CBK Vehicle Meta Studio v4.0
 * Dependency-free FiveM / GTA V vehicle metadata editor.
 * The smart editors modify existing XML nodes in-place so unknown/custom tags are preserved.
 */

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const basename = p => p.replace(/\\/g,'/').split('/').pop();
const dirname = p => { const a=p.replace(/\\/g,'/').split('/'); a.pop(); return a.join('/'); };
const normalizePath = p => String(p ?? '')
  .replace(/\0/g,'')
  .replace(/\\/g,'/')
  .replace(/^[A-Za-z]:/,'')
  .replace(/^\/+/,'')
  .split('/')
  .filter(part=>part && part!=='.' && part!=='..')
  .join('/');

const FILE_DEFS = {
  'handling.meta': {type:'HANDLING_FILE', root:'CHandlingDataMgr', category:'Core', smart:'handling', desc:'Vehicle physics, transmission, traction, suspension, damage and sub-handling data.'},
  'vehicles.meta': {type:'VEHICLE_METADATA_FILE', root:'CVehicleModelInfo__InitDataList', category:'Core', smart:'vehicles', desc:'Vehicle identity, model/texture names, handling binding, audio, layout, class, cameras, flags and extras.'},
  'carvariations.meta': {type:'VEHICLE_VARIATION_FILE', root:'CVehicleModelInfoVariation', category:'Core', smart:'variations', desc:'Vehicle colors, liveries, mod-kit binding, plate probabilities, light settings and siren settings.'},
  'carcols.meta': {type:'CARCOLS_FILE', root:'CVehicleModelInfoVarGlobal', category:'Core', smart:'carcols', desc:'Vehicle mod kits, lights, siren settings, wheels and other global vehicle variation data.'},
  'vehiclelayouts.meta': {type:'VEHICLE_LAYOUTS_FILE', root:'CVehicleMetadataMgr', category:'Optional', smart:'generic', desc:'Custom seating, entry/exit, first-person drive-by, cover and vehicle layout metadata.'},
  'vehiclelayout.meta': {type:'VEHICLE_LAYOUTS_FILE', root:'CVehicleMetadataMgr', category:'Optional', smart:'generic', desc:'Custom seating, entry/exit, first-person drive-by, cover and vehicle layout metadata.'},
  'contentunlocks.meta': {type:'CONTENT_UNLOCKING_META_FILE', root:'SContentUnlocks', category:'Optional', smart:'generic', desc:'DLC/content unlocking metadata used by some converted vehicle packs.'},
  'carcontentunlocks.meta': {type:'CONTENT_UNLOCKING_META_FILE', root:'SContentUnlocks', category:'Optional', smart:'generic', desc:'Alternate content-unlock filename used by some converted vehicle packs.'},
  'caraddoncontentunlocks.meta': {type:'CONTENT_UNLOCKING_META_FILE', root:'SContentUnlocks', category:'Optional', smart:'generic', desc:'Common addon-vehicle content unlock filename.'},
  'shop_vehicle.meta': {type:'VEHICLE_SHOP_DLC_FILE', root:'ShopVehicleDataArray', category:'Optional', smart:'generic', desc:'Vehicle shop DLC metadata. Mostly relevant to converted DLC structures.'},
  'dlctext.meta': {type:'TEXTFILE_METAFILE', aliases:['DLC_TEXT_FILE'], root:'CExtraTextMetaFile', category:'Compatibility', smart:'generic', desc:'DLC text metadata. New manifests use FiveM’s current TEXTFILE_METAFILE type; legacy DLC_TEXT_FILE registrations are accepted and preserved.'},
  'vfxvehicleinfo.meta': {type:'VFXVEHICLEINFO_FILE', root:null, category:'Advanced', smart:'generic', desc:'Vehicle VFX metadata such as exhaust, wheel and effect behavior.'},
  'vehiclemodelsets.meta': {type:'AMBIENT_VEHICLE_MODEL_SET_FILE', root:null, category:'Advanced', smart:'generic', desc:'Ambient vehicle model sets for traffic/population systems.'},
  'vehicleextras.dat': {type:'VEHICLEEXTRAS_FILE', root:null, category:'Advanced', smart:'text', desc:'Vehicle extras configuration data. This is a DAT file rather than XML.'},
  'fxmanifest.lua': {type:'RESOURCE_MANIFEST', root:null, category:'Resource', smart:'text', desc:'FiveM resource manifest generated from the data files loaded in this project.'},
  'vehicle_names.lua': {type:'CLIENT_SCRIPT', root:null, category:'Resource', smart:'text', desc:'Optional AddTextEntry client script generated from vehicles.meta gameName/modelName values.'}
};

function inferDef(path){
  const b=basename(path).toLowerCase();
  if(FILE_DEFS[b]) return FILE_DEFS[b];
  const patterns=[
    [/handling.*\.meta$/,FILE_DEFS['handling.meta']],
    [/vehicles?.*\.meta$/,FILE_DEFS['vehicles.meta']],
    [/carvariations?.*\.meta$/,FILE_DEFS['carvariations.meta']],
    [/carcols?.*\.meta$/,FILE_DEFS['carcols.meta']],
    [/vehiclelayouts?.*\.meta$/,FILE_DEFS['vehiclelayouts.meta']],
    [/(?:caraddon|car)?contentunlocks?.*\.meta$/,FILE_DEFS['contentunlocks.meta']],
    [/shop_vehicle.*\.meta$/,FILE_DEFS['shop_vehicle.meta']],
    [/vfxvehicleinfo.*\.meta$/,FILE_DEFS['vfxvehicleinfo.meta']],
    [/vehiclemodelsets.*\.meta$/,FILE_DEFS['vehiclemodelsets.meta']]
  ];
  for(const [re,def] of patterns) if(re.test(b)) return def;
  if(b.endsWith('.meta') || b.endsWith('.xml')) return {type:'UNREGISTERED_XML',root:null,category:'Other XML',smart:'generic',desc:'XML metadata file. The app preserves it exactly; an existing fxmanifest registration is also preserved.'};
  return {type:'TEXT_FILE',root:null,category:'Other',smart:'text',desc:'Plain-text resource file preserved with the project.'};
}
function isXmlFile(path){ const b=basename(path).toLowerCase(); return b.endsWith('.meta') || b.endsWith('.xml'); }

const HANDLING_GROUPS = [
  {name:'Identity & Physical', fields:[
    ['handlingName','text',null,null,'Identifier referenced by vehicles.meta. Keep it unique.'],
    ['fMass','number',1,10000,'Vehicle mass in kilograms.'],
    ['fInitialDragCoeff','number',0,200,'Aerodynamic drag coefficient used by GTA handling.'],
    ['fDownforceModifier','number',0,20,'Downforce modifier where supported.'],
    ['fPercentSubmerged','number',0,1000,'Submerged percentage before buoyancy behavior.'],
    ['vecCentreOfMassOffset','vector',null,null,'Center of mass offset: X lateral, Y longitudinal, Z vertical.'],
    ['vecInertiaMultiplier','vector',null,null,'Rotational inertia multiplier on X/Y/Z axes.']
  ]},
  {name:'Transmission & Brakes', fields:[
    ['fDriveBiasFront','number',0,1,'0 = RWD, 1 = FWD, between = AWD bias.'],
    ['nInitialDriveGears','integer',1,10,'Forward gear count.'],
    ['fInitialDriveForce','number',0,5,'Engine drive force / acceleration strength.'],
    ['fDriveInertia','number',0,10,'How quickly engine speed responds.'],
    ['fClutchChangeRateScaleUpShift','number',0,100,'Upshift clutch rate scale.'],
    ['fClutchChangeRateScaleDownShift','number',0,100,'Downshift clutch rate scale.'],
    ['fInitialDriveMaxFlatVel','number',0,1000,'Transmission maximum flat-velocity parameter.'],
    ['fBrakeForce','number',0,10,'Overall braking force.'],
    ['fBrakeBiasFront','number',0,1,'Brake distribution: 0 rear, 1 front.'],
    ['fHandBrakeForce','number',0,10,'Handbrake force.'],
    ['fSteeringLock','number',0,90,'Steering lock angle.']
  ]},
  {name:'Traction', fields:[
    ['fTractionCurveMax','number',0,10,'Peak tire grip.'],['fTractionCurveMin','number',0,10,'Sliding/minimum tire grip.'],
    ['fTractionCurveLateral','number',0,40,'Lateral traction response angle.'],['fTractionSpringDeltaMax','number',0,2,'Maximum traction spring delta.'],
    ['fLowSpeedTractionLossMult','number',0,10,'Low-speed traction loss multiplier.'],['fCamberStiffnesss','number',-10,10,'Camber stiffness (the GTA tag contains three s characters).'],
    ['fTractionBiasFront','number',0,1,'Front/rear traction balance.'],['fTractionLossMult','number',0,10,'Overall traction loss multiplier.']
  ]},
  {name:'Suspension & Roll', fields:[
    ['fSuspensionForce','number',0,20,'Suspension spring strength.'],['fSuspensionCompDamp','number',0,20,'Compression damping.'],
    ['fSuspensionReboundDamp','number',0,20,'Rebound damping.'],['fSuspensionUpperLimit','number',-2,2,'Upper suspension travel limit.'],
    ['fSuspensionLowerLimit','number',-2,2,'Lower suspension travel limit.'],['fSuspensionRaise','number',-1,1,'Static suspension height adjustment.'],
    ['fSuspensionBiasFront','number',0,1,'Front/rear suspension balance.'],['fAntiRollBarForce','number',0,20,'Anti-roll bar force.'],
    ['fAntiRollBarBiasFront','number',0,1,'Front/rear anti-roll balance.'],['fRollCentreHeightFront','number',-2,2,'Front roll-center height.'],['fRollCentreHeightRear','number',-2,2,'Rear roll-center height.']
  ]},
  {name:'Damage, Fuel & Misc', fields:[
    ['fCollisionDamageMult','number',0,10,'Collision damage multiplier.'],['fWeaponDamageMult','number',0,10,'Weapon damage multiplier.'],
    ['fDeformationDamageMult','number',0,10,'Visual deformation damage multiplier.'],['fEngineDamageMult','number',0,10,'Engine damage multiplier.'],
    ['fPetrolTankVolume','number',0,1000,'Fuel tank volume parameter.'],['fOilVolume','number',0,100,'Oil volume parameter.'],
    ['fPetrolConsumptionRate','number',0,100,'Fuel consumption parameter when present.'],['fSeatOffsetDistX','number',-10,10,'Seat X offset.'],
    ['fSeatOffsetDistY','number',-10,10,'Seat Y offset.'],['fSeatOffsetDistZ','number',-10,10,'Seat Z offset.'],
    ['nMonetaryValue','integer',0,100000000,'Vehicle monetary value.'],['strModelFlags','text',null,null,'Model flags bitmask string.'],
    ['strHandlingFlags','text',null,null,'Handling flags bitmask string.'],['strDamageFlags','text',null,null,'Damage flags bitmask string.'],['AIHandling','text',null,null,'AI handling profile.']
  ]}
];

const VEHICLE_GROUPS = [
  {name:'Identity & References', fields:[
    ['modelName','text','Spawn/model name. Must match streamed YFT basename.'],['txdName','text','Texture dictionary name. Usually matches streamed YTD basename.'],
    ['handlingId','text','Must match a handlingName in handling.meta.'],['gameName','text','Game/display text key.'],['vehicleMakeName','text','Manufacturer text key.'],
    ['audioNameHash','text','Audio profile/hash name. Empty can use default behavior.'],['layout','text','Vehicle layout such as LAYOUT_STANDARD or custom layout name.']
  ]},
  {name:'Vehicle Type', fields:[
    ['type','text','Vehicle type, e.g. VEHICLE_TYPE_CAR / BIKE / BOAT / HELI / PLANE.'],['plateType','text','Plate configuration.'],
    ['dashboardType','text','Dashboard type.'],['vehicleClass','text','Vehicle class such as VC_EMERGENCY / VC_SPORT / VC_SUV.'],['wheelType','text','Wheel category such as VWT_SPORT / VWT_MUSCLE / VWT_OFFROAD.']
  ]},
  {name:'Gameplay & Flags', fields:[
    ['frequency','attr','Population frequency value.'],['maxNum','attr','Maximum number value when present.'],['maxNumOfSameColor','attr','Maximum same-color count.'],
    ['defaultBodyHealth','attr','Default vehicle body health.'],['visibleSpawnDistScale','attr','Spawn visibility distance scale.'],['weaponForceMult','attr','Weapon force multiplier.'],
    ['flags','text','Space-separated vehicle flags. Unknown flags are preserved.']
  ]},
  {name:'Camera / Layout References', fields:[
    ['coverBoundOffsets','text','Cover bound offsets profile.'],['explosionInfo','text','Explosion info profile.'],['scenarioLayout','text','Scenario layout profile.'],
    ['cameraName','text','Follow camera.'],['aimCameraName','text','Aim camera.'],['bonnetCameraName','text','Bonnet camera.'],['povCameraName','text','First-person POV camera.']
  ]}
];

const TEMPLATES = {
'handling.meta': `<?xml version="1.0" encoding="UTF-8"?>\n<CHandlingDataMgr>\n  <HandlingData>\n    <Item type="CHandlingData">\n      <handlingName>NEWCAR</handlingName>\n      <fMass value="1800.000000" />\n      <fInitialDragCoeff value="8.000000" />\n      <fPercentSubmerged value="85.000000" />\n      <vecCentreOfMassOffset x="0.000000" y="0.000000" z="0.000000" />\n      <vecInertiaMultiplier x="1.000000" y="1.000000" z="1.000000" />\n      <fDriveBiasFront value="0.500000" />\n      <nInitialDriveGears value="6" />\n      <fInitialDriveForce value="0.300000" />\n      <fDriveInertia value="1.000000" />\n      <fClutchChangeRateScaleUpShift value="2.000000" />\n      <fClutchChangeRateScaleDownShift value="2.000000" />\n      <fInitialDriveMaxFlatVel value="160.000000" />\n      <fBrakeForce value="0.850000" />\n      <fBrakeBiasFront value="0.580000" />\n      <fHandBrakeForce value="0.700000" />\n      <fSteeringLock value="38.000000" />\n      <fTractionCurveMax value="2.450000" />\n      <fTractionCurveMin value="2.200000" />\n      <fTractionCurveLateral value="22.500000" />\n      <fTractionSpringDeltaMax value="0.150000" />\n      <fLowSpeedTractionLossMult value="1.000000" />\n      <fCamberStiffnesss value="0.000000" />\n      <fTractionBiasFront value="0.500000" />\n      <fTractionLossMult value="1.000000" />\n      <fSuspensionForce value="2.400000" />\n      <fSuspensionCompDamp value="1.400000" />\n      <fSuspensionReboundDamp value="2.100000" />\n      <fSuspensionUpperLimit value="0.100000" />\n      <fSuspensionLowerLimit value="-0.120000" />\n      <fSuspensionRaise value="0.000000" />\n      <fSuspensionBiasFront value="0.500000" />\n      <fAntiRollBarForce value="0.700000" />\n      <fAntiRollBarBiasFront value="0.550000" />\n      <fRollCentreHeightFront value="0.300000" />\n      <fRollCentreHeightRear value="0.300000" />\n      <fCollisionDamageMult value="1.000000" />\n      <fWeaponDamageMult value="1.000000" />\n      <fDeformationDamageMult value="1.000000" />\n      <fEngineDamageMult value="1.500000" />\n      <fPetrolTankVolume value="65.000000" />\n      <fOilVolume value="5.000000" />\n      <nMonetaryValue value="35000" />\n      <strModelFlags>440010</strModelFlags>\n      <strHandlingFlags>0</strHandlingFlags>\n      <strDamageFlags>0</strDamageFlags>\n      <AIHandling>AVERAGE</AIHandling>\n      <SubHandlingData>\n        <Item type="NULL" />\n        <Item type="NULL" />\n        <Item type="NULL" />\n      </SubHandlingData>\n    </Item>\n  </HandlingData>\n</CHandlingDataMgr>`,
'vehicles.meta': `<?xml version="1.0" encoding="UTF-8"?>\n<CVehicleModelInfo__InitDataList>\n  <residentTxd>vehshare</residentTxd>\n  <residentAnims />\n  <InitDatas>\n    <Item>\n      <modelName>newcar</modelName>\n      <txdName>newcar</txdName>\n      <handlingId>NEWCAR</handlingId>\n      <gameName>NEWCAR</gameName>\n      <vehicleMakeName>VAPID</vehicleMakeName>\n      <expressionDictName>null</expressionDictName>\n      <expressionName>null</expressionName>\n      <animConvRoofDictName>null</animConvRoofDictName>\n      <animConvRoofName>null</animConvRoofName>\n      <animConvRoofWindowsAffected />\n      <ptfxAssetName>null</ptfxAssetName>\n      <audioNameHash />\n      <layout>LAYOUT_STANDARD</layout>\n      <coverBoundOffsets>STANDARD_COVER_OFFSET_INFO</coverBoundOffsets>\n      <explosionInfo>EXPLOSION_INFO_DEFAULT</explosionInfo>\n      <scenarioLayout />\n      <cameraName>FOLLOW_VEHICLE_CAMERA</cameraName>\n      <aimCameraName>DEFAULT_THIRD_PERSON_VEHICLE_AIM_CAMERA</aimCameraName>\n      <bonnetCameraName>VEHICLE_BONNET_CAMERA_STANDARD_LONG</bonnetCameraName>\n      <povCameraName>DEFAULT_POV_CAMERA</povCameraName>\n      <type>VEHICLE_TYPE_CAR</type>\n      <plateType>VPT_FRONT_AND_BACK_PLATES</plateType>\n      <dashboardType>VDT_NORMAL</dashboardType>\n      <vehicleClass>VC_SEDAN</vehicleClass>\n      <wheelType>VWT_SPORT</wheelType>\n      <trailers />\n      <additionalTrailers />\n      <drivers />\n      <extraIncludes />\n      <doorsWithCollisionWhenClosed />\n      <driveableDoors />\n      <bumpersNeedToCollideWithMap value="true" />\n      <needsRopeTexture value="false" />\n      <requiredExtras />\n      <rewards />\n      <flags>FLAG_SPORTS</flags>\n    </Item>\n  </InitDatas>\n  <txdRelationships />\n</CVehicleModelInfo__InitDataList>`,
'carvariations.meta': `<?xml version="1.0" encoding="UTF-8"?>\n<CVehicleModelInfoVariation>\n  <variationData>\n    <Item>\n      <modelName>newcar</modelName>\n      <colors>\n        <Item>\n          <indices content="char_array">\n            0\n            0\n            0\n            156\n          </indices>\n          <liveries />\n        </Item>\n      </colors>\n      <kits>\n        <Item>0_default_modkit</Item>\n      </kits>\n      <windowsWithExposedEdges />\n      <plateProbabilities />\n      <lightSettings value="0" />\n      <sirenSettings value="0" />\n    </Item>\n  </variationData>\n</CVehicleModelInfoVariation>`,
'carcols.meta': `<?xml version="1.0" encoding="UTF-8"?>\n<CVehicleModelInfoVarGlobal>\n  <Kits />\n  <Lights />\n  <Sirens />\n</CVehicleModelInfoVarGlobal>`,
'vehiclelayouts.meta': `<?xml version="1.0" encoding="UTF-8"?>\n<CVehicleMetadataMgr>\n  <VehicleCoverBoundOffsetInfos />\n  <FirstPersonDriveByLookAroundData />\n  <VehicleSeatInfos />\n  <VehicleEntryPointInfos />\n  <VehicleEntryPointAnimInfos />\n  <VehicleLayoutInfos />\n</CVehicleMetadataMgr>`,
'contentunlocks.meta': `<?xml version="1.0" encoding="UTF-8"?>\n<SContentUnlocks>\n  <listOfUnlocks />\n</SContentUnlocks>`,
'shop_vehicle.meta': `<?xml version="1.0" encoding="UTF-8"?>\n<ShopVehicleDataArray>\n  <Vehicles />\n</ShopVehicleDataArray>`,
'dlctext.meta': `<?xml version="1.0" encoding="UTF-8"?>\n<CExtraTextMetaFile>\n  <hasGlobalTextFile value="true" />\n  <hasAdditionalText value="false" />\n  <isTitleUpdate value="false" />\n</CExtraTextMetaFile>`,
'vfxvehicleinfo.meta': `<?xml version="1.0" encoding="UTF-8"?>\n<CVfxVehicleInfoMgr>\n</CVfxVehicleInfoMgr>`,
'vehiclemodelsets.meta': `<?xml version="1.0" encoding="UTF-8"?>\n<CAmbientModelSets>\n</CAmbientModelSets>`,
'vehicleextras.dat': `# vehicleextras.dat\n# Import an original/known-good file when a vehicle requires custom extras data.\n`,
'fxmanifest.lua': '',
'vehicle_names.lua': ''
};

const SAFE_NEW_TEMPLATES = new Set(['handling.meta','vehicles.meta','carvariations.meta','carcols.meta','vehiclelayouts.meta','contentunlocks.meta','shop_vehicle.meta','dlctext.meta']);
const IMPORT_ONLY_TEMPLATES = new Set(['vfxvehicleinfo.meta','vehiclemodelsets.meta','vehicleextras.dat']);

let files = new Map();          // path -> {path,text,dirty,sourceFile?}
let assets = new Map();         // path -> File
let currentPath = '';
let selectedEntry = 0;
let currentTab = 'smart';
let diagnostics = [];
let projectDirty = false;

const REF = window.CBK_REFERENCE || {handlingStats:{},handlingRecords:[],vehicleRecords:[],vehicleEnums:{},source:{}};
const HANDLING_REF_BY_NAME = new Map((REF.handlingRecords||[]).map(r=>[String(r.name||'').toUpperCase(),r]));
const HARD_RULES = {
  fMass:{minExclusive:0,label:'Mass must be greater than zero.'},
  fInitialDragCoeff:{min:0,label:'Drag cannot be negative.'},
  fPercentSubmerged:{minExclusive:0,label:'Percent submerged must be greater than zero.'},
  fDriveBiasFront:{min:0,max:1,label:'Drive bias must be between 0 (RWD) and 1 (FWD).'},
  nInitialDriveGears:{integer:true,min:1,max:20,label:'Gear count must be a positive integer.'},
  fInitialDriveForce:{min:0,label:'Drive force cannot be negative.'},
  fDriveInertia:{min:0,label:'Drive inertia cannot be negative.'},
  fBrakeForce:{min:0,label:'Brake force cannot be negative.'},
  fBrakeBiasFront:{min:0,max:1,label:'Brake bias must be between 0 and 1.'},
  fHandBrakeForce:{min:0,label:'Handbrake force cannot be negative.'},
  fSteeringLock:{minExclusive:0,max:180,label:'Steering lock must be positive; values above 180 are almost certainly corrupt.'},
  fTractionCurveMax:{min:0,label:'Traction values cannot be negative.'},
  fTractionCurveMin:{min:0,label:'Traction values cannot be negative.'},
  fTractionBiasFront:{min:0,max:1,label:'Traction bias must be between 0 and 1.'},
  fSuspensionBiasFront:{min:0,max:1,label:'Suspension bias must be between 0 and 1.'},
  fAntiRollBarBiasFront:{min:0,max:1,label:'Anti-roll bias must be between 0 and 1.'},
  fPetrolTankVolume:{min:0,label:'Fuel tank volume cannot be negative.'},
  fOilVolume:{min:0,label:'Oil volume cannot be negative.'}
};
const TEXT_EXTENSIONS = /\.(meta|xml|lua|txt|dat|json|cfg|ini|md|js|css|html|yml|yaml)$/i;
const STREAM_EXTENSIONS = /\.(yft|ytd|ydr|ydd|ybn|ycd|ymap|ytyp|awc|rel|ymt|ypt|yld)$/i;
const DATA_FOLDER = 'data';
const DATA_XML_FILENAMES = new Set(['content.xml','setup2.xml']);
const DATA_DAT_FILENAMES = new Set(['vehicleextras.dat']);

function fmtNum(n){ if(!Number.isFinite(Number(n))) return String(n??''); const x=Number(n); return Math.abs(x)>=1000?x.toLocaleString(undefined,{maximumFractionDigits:3}):String(Math.round(x*1e6)/1e6); }
function getHandlingReference(name){ return HANDLING_REF_BY_NAME.get(String(name||'').toUpperCase())||null; }
function empiricalState(tag,value){
  const st=REF.handlingStats?.[tag]; const n=Number(value); if(!st||!Number.isFinite(n)) return null;
  if(n<st.min || n>st.max) return {level:'warn',text:`Outside supplied GTA reference range ${fmtNum(st.min)}–${fmtNum(st.max)}`};
  if(n<st.p01 || n>st.p99) return {level:'notice',text:`Extreme GTA-range value (99% band ${fmtNum(st.p01)}–${fmtNum(st.p99)})`};
  if(n<st.p05 || n>st.p95) return {level:'notice',text:`Unusual GTA-range value (90% band ${fmtNum(st.p05)}–${fmtNum(st.p95)})`};
  return {level:'ok',text:`GTA reference median ${fmtNum(st.median)} · 90% band ${fmtNum(st.p05)}–${fmtNum(st.p95)}`};
}
function hardRuleState(tag,value){
  const r=HARD_RULES[tag]; if(!r) return null; const n=Number(value); if(!Number.isFinite(n)) return {level:'error',text:'Not a valid number.'};
  if(r.integer&&!Number.isInteger(n)) return {level:'error',text:r.label};
  if(r.min!=null&&n<r.min || r.minExclusive!=null&&n<=r.minExclusive || r.max!=null&&n>r.max) return {level:'error',text:r.label};
  return null;
}
function commonRoot(paths){
  const ps=paths.map(normalizePath).filter(Boolean); if(!ps.length)return '';
  const first=ps[0].split('/')[0]; if(!first||!ps.every(p=>p.includes('/')&&p.split('/')[0]===first))return '';
  return first;
}
function stripRoot(path,root){ path=normalizePath(path); return root&&path.startsWith(root+'/')?path.slice(root.length+1):path; }
function isLikelyText(path){ return TEXT_EXTENSIONS.test(basename(path)); }
function assetBytes(entry){ if(entry?.bytes)return Promise.resolve(entry.bytes); if(entry?.file)return entry.file.arrayBuffer().then(b=>new Uint8Array(b)); return Promise.resolve(new Uint8Array()); }
function isVehicleDataLikePath(path){
  const b=basename(path).toLowerCase();
  return b.endsWith('.meta') || DATA_XML_FILENAMES.has(b) || DATA_DAT_FILENAMES.has(b);
}
function shouldStoreInDataFolder(path){
  const p=normalizePath(path);
  if(!p || p.toLowerCase().startsWith(DATA_FOLDER+'/') || !isVehicleDataLikePath(p))return false;
  if(!dirname(p))return true;
  const def=inferDef(p);
  return def.type && !['UNREGISTERED_XML','TEXT_FILE','RESOURCE_MANIFEST','CLIENT_SCRIPT'].includes(def.type);
}
function canonicalProjectPath(path){
  const p=normalizePath(path);
  return shouldStoreInDataFolder(p)?`${DATA_FOLDER}/${p}`:p;
}
function uniqueProjectPath(path, registry=files){
  let p=canonicalProjectPath(path);
  if(!registry.has(p))return p;
  const dir=dirname(p), b=basename(p), dot=b.lastIndexOf('.');
  const stem=dot>0?b.slice(0,dot):b, ext=dot>0?b.slice(dot):'', prefix=dir?`${dir}/`:'';
  let i=2;
  while(registry.has(`${prefix}${stem}_${i}${ext}`))i++;
  return `${prefix}${stem}_${i}${ext}`;
}

function parseXml(text){
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const err = doc.querySelector('parsererror');
  if(err) throw new Error(err.textContent.replace(/\s+/g,' ').trim());
  return doc;
}
function serializeXml(doc){
  const raw = new XMLSerializer().serializeToString(doc);
  return formatXml(raw);
}
function formatXml(xml){
  const PADDING='  ';
  xml=xml.replace(/>\s*</g,'><').replace(/(<[^!?][^>]*>)(?=<)/g,'$1\n').replace(/(>)(<\/)/g,'$1\n$2');
  let pad=0, out='';
  xml.split(/\n/).filter(Boolean).forEach(line=>{
    line=line.trim();
    if(/^<\//.test(line)) pad=Math.max(0,pad-1);
    out += PADDING.repeat(pad)+line+'\n';
    if(/^<[^!?/][^>]*>$/.test(line) && !/\/>$/.test(line) && !/<\/[^>]+>$/.test(line)) pad++;
  });
  return out.trim()+"\n";
}
function directChild(node,name){ return [...node.children].find(n=>n.tagName===name)||null; }
function getText(node,name){ const c=directChild(node,name); return c?c.textContent.trim():''; }
function getAttrVal(node,name,attr='value'){ const c=directChild(node,name); return c?c.getAttribute(attr)||'':''; }
function setText(doc,node,name,val){ let c=directChild(node,name); if(!c){c=doc.createElement(name);node.appendChild(c)} c.textContent=val; }
function setAttrVal(doc,node,name,val,attr='value'){ let c=directChild(node,name); if(!c){c=doc.createElement(name);node.appendChild(c)} c.setAttribute(attr,val); }
function allChildren(node,name){ return [...node.children].filter(n=>n.tagName===name); }

function makeFile(path,text,dirty=false,sourceFile=null){
  path=canonicalProjectPath(path);
  files.set(path,{path,text:String(text),dirty,sourceFile});
  if(!currentPath) currentPath=path;
}
function currentFile(){ return files.get(currentPath); }
function markDirty(path=currentPath){
  const f=files.get(path); if(f) f.dirty=true;
  projectDirty=true;
  renderProjectState(); renderFileList();
}
function commitDoc(path,doc){ const f=files.get(path); if(!f)return; f.text=serializeXml(doc); markDirty(path); }

function newProject(){
  files.clear(); assets.clear(); selectedEntry=0; projectDirty=false;
  makeFile('data/handling.meta',TEMPLATES['handling.meta']);
  makeFile('data/vehicles.meta',TEMPLATES['vehicles.meta']);
  makeFile('data/carvariations.meta',TEMPLATES['carvariations.meta']);
  makeFile('data/carcols.meta',TEMPLATES['carcols.meta']);
  currentPath='data/handling.meta';
  $('#projectName').value='cbk_vehicle';
  refreshManifest(false);
  runDiagnostics(); renderAll(); if($('#renameOldSpawn'))refreshRenameTargets(true);
}

function readFileAsText(file){ return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsText(file);}); }
function resetImportedProject(){ files.clear(); assets.clear(); currentPath=''; selectedEntry=0; projectDirty=false; renameLastPlan=null; if($('#renameNewSpawn'))$('#renameNewSpawn').value=''; if($('#renameResourceName'))$('#renameResourceName').value=''; }
async function importFiles(list,folderMode=false){
  const arr=[...list]; if(!arr.length)return;
  resetImportedProject();
  const rawPaths=arr.map(f=>normalizePath(f.webkitRelativePath||f.name));
  const root=folderMode?commonRoot(rawPaths):'';
  let loaded=0;
  for(let i=0;i<arr.length;i++){
    const file=arr[i]; const rel=uniqueProjectPath(stripRoot(rawPaths[i],root)); if(!rel||rel.endsWith('/'))continue;
    if(isLikelyText(rel)){
      try{ const text=await readFileAsText(file); makeFile(rel,text,false,file); loaded++; }catch(e){ console.error('Import failed',rel,e); }
    }else{
      assets.set(rel,{file});
    }
  }
  if(folderMode && root) $('#projectName').value=root.replace(/[^a-zA-Z0-9_-]/g,'_');
  finalizeImport(loaded,`folder${root?` ${root}`:''}`);
}
function finalizeImport(loaded,sourceLabel='resource'){
  const preferred=['vehicles.meta','handling.meta','carvariations.meta','carcols.meta'];
  const firstEditable=[...files.keys()].find(p=>preferred.includes(basename(p).toLowerCase())) || [...files.keys()][0];
  if(firstEditable) currentPath=firstEditable;
  projectDirty=false; runDiagnostics(); renderAll(); refreshRenameTargets(true);
  toast(`Imported ${sourceLabel}: ${loaded} editable/text file${loaded===1?'':'s'} + ${assets.size} binary/stream asset${assets.size===1?'':'s'}.`);
}

function u16at(v,o){return v.getUint16(o,true)} function u32at(v,o){return v.getUint32(o,true)}
async function inflateRaw(bytes){
  if(typeof DecompressionStream==='undefined') throw new Error('This browser cannot decompress ZIP files. Use Import resource folder instead.');
  let ds; try{ds=new DecompressionStream('deflate-raw')}catch{throw new Error('This browser does not support raw DEFLATE ZIP extraction. Use Import resource folder instead.');}
  const stream=new Blob([bytes]).stream().pipeThrough(ds); return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unzipEntries(file){
  const buf=await file.arrayBuffer(), bytes=new Uint8Array(buf), view=new DataView(buf); let eocd=-1;
  const min=Math.max(0,bytes.length-65557); for(let i=bytes.length-22;i>=min;i--){if(u32at(view,i)===0x06054b50){eocd=i;break}}
  if(eocd<0) throw new Error('ZIP end-of-central-directory record was not found.');
  const total=u16at(view,eocd+10), cdOffset=u32at(view,eocd+16); let off=cdOffset, totalOut=0; const entries=[]; const dec=new TextDecoder('utf-8');
  for(let n=0;n<total;n++){
    if(off+46>bytes.length||u32at(view,off)!==0x02014b50) throw new Error('ZIP central directory is damaged.');
    const flags=u16at(view,off+8), method=u16at(view,off+10), comp=u32at(view,off+20), uncomp=u32at(view,off+24), nl=u16at(view,off+28), xl=u16at(view,off+30), cl=u16at(view,off+32), local=u32at(view,off+42);
    const name=normalizePath(dec.decode(bytes.slice(off+46,off+46+nl))); off+=46+nl+xl+cl;
    if(!name||name.endsWith('/'))continue; if(flags&1)throw new Error(`Encrypted ZIP entry is unsupported: ${name}`);
    if(uncomp>512*1024*1024)throw new Error(`ZIP entry is too large to safely load: ${name}`); totalOut+=uncomp; if(totalOut>1024*1024*1024)throw new Error('ZIP expands beyond the 1 GB safety limit.');
    if(local+30>bytes.length||u32at(view,local)!==0x04034b50)throw new Error(`ZIP local header is damaged: ${name}`);
    const lnl=u16at(view,local+26), lxl=u16at(view,local+28), dataStart=local+30+lnl+lxl, packed=bytes.slice(dataStart,dataStart+comp);
    let data; if(method===0)data=packed; else if(method===8)data=await inflateRaw(packed); else throw new Error(`ZIP compression method ${method} is unsupported (${name}).`);
    if(uncomp && data.length!==uncomp) console.warn('ZIP size mismatch',name,uncomp,data.length);
    entries.push({name,data});
  }
  return entries;
}
async function importZip(file){
  if(!file)return; try{
    const entries=await unzipEntries(file); if(!entries.length)throw new Error('ZIP contains no files.'); resetImportedProject();
    const root=commonRoot(entries.map(e=>e.name)); let loaded=0; const dec=new TextDecoder('utf-8');
    for(const ent of entries){const path=uniqueProjectPath(stripRoot(ent.name,root));if(!path)continue;if(isLikelyText(path)){makeFile(path,dec.decode(ent.data),false,null);loaded++;}else assets.set(path,{bytes:ent.data});}
    $('#projectName').value=(root||file.name.replace(/\.zip$/i,'')||'vehicle_resource').replace(/[^a-zA-Z0-9_-]/g,'_'); finalizeImport(loaded,'ZIP');
  }catch(e){alert(`Could not import ZIP:\n\n${e.message}\n\nYou can still use “Import resource folder” for this resource.`);}
}

function pathStatus(path){
  const f=files.get(path), def=inferDef(path);
  if(isXmlFile(path)){
    try{ const doc=parseXml(f.text); if(def.root && doc.documentElement.tagName!==def.root) return 'error'; }
    catch{return 'error'}
  }
  const related=diagnostics.filter(d=>d.path===path && d.level!=='ok');
  return related.some(d=>d.level==='error')?'error':related.length?'warn':f.dirty?'warn':'ok';
}
function renderFileList(){
  const q=$('#fileSearch').value.trim().toLowerCase();
  const groups={Core:[],Optional:[],Compatibility:[],Advanced:[],Resource:[],'Other XML':[],Other:[]};
  [...files.keys()].sort((a,b)=>a.localeCompare(b)).forEach(path=>{
    if(q && !path.toLowerCase().includes(q))return;
    const def=inferDef(path); (groups[def.category] ||= []).push(path);
  });
  $('#fileList').innerHTML=Object.entries(groups).filter(([,v])=>v.length).map(([cat,paths])=>{
    const body=paths.map(path=>{
      const st=pathStatus(path), f=files.get(path);
      return `<button class="file-item ${path===currentPath?'active':''}" data-path="${esc(path)}"><span class="file-icon">${basename(path).toLowerCase().endsWith('.lua')?'LUA':basename(path).toLowerCase().endsWith('.dat')?'DAT':'XML'}</span><span><b>${esc(basename(path))}${f.dirty?' *':''}</b><small>${esc(path)}</small></span><i class="status-dot ${st==='ok'?'':st}"></i></button>`;
    }).join('');
    return `<div class="file-group"><div class="eyebrow" style="padding:8px 7px 4px">${esc(cat)}</div>${body}</div>`;
  }).join('');
  $$('.file-item').forEach(b=>b.onclick=()=>{currentPath=b.dataset.path;selectedEntry=0;renderAll();});
}
function renderProjectState(){
  const errors=diagnostics.filter(d=>d.level==='error').length, warns=diagnostics.filter(d=>d.level==='warn').length;
  const el=$('#projectState');
  if(errors){el.className='pill error';el.textContent=`${errors} error${errors===1?'':'s'}`}
  else if(warns){el.className='pill warn';el.textContent=`${warns} warning${warns===1?'':'s'}`}
  else{el.className='pill ok';el.textContent=projectDirty?'Edited':'Ready'}
  $('#assetCount').textContent=assets.size;
  $('#diagCount').textContent=errors+warns;
}
function renderHeader(){
  const f=currentFile(); if(!f)return;
  const def=inferDef(currentPath);
  $('#currentFileName').textContent=basename(currentPath);
  $('#fileCategory').textContent=(def.category+' vehicle data').toUpperCase();
  $('#fileDescription').textContent=def.desc;
  $('#currentFileType').textContent=def.type;
  $('#dirtyBadge').classList.toggle('hidden',!f.dirty);
}

function entryShell(items,labelFn,renderEditor,opts={}){
  const qid='entrySearch';
  $('#smartTab').innerHTML=`<div class="smart-layout"><aside class="entry-panel card"><div class="entry-toolbar"><input id="${qid}" placeholder="Search entries…"><button id="entryAdd">+ Add</button></div><div id="entryList" class="entry-list"></div><div class="entry-actions"><button id="entryClone">Clone</button><button id="entryDelete" class="danger">Delete</button></div></aside><div id="smartMain" class="smart-main"></div></div>`;
  function drawList(){ const q=$('#'+qid).value.toLowerCase(); $('#entryList').innerHTML=items.map((it,i)=>({it,i,label:labelFn(it,i)})).filter(x=>x.label.toLowerCase().includes(q)).map(x=>`<button class="entry ${x.i===selectedEntry?'active':''}" data-i="${x.i}"><b>${esc(x.label||'(unnamed)')}</b><small>Entry ${x.i+1}</small></button>`).join('')||'<div class="note">No matching entries.</div>'; $$('.entry').forEach(b=>b.onclick=()=>{selectedEntry=+b.dataset.i;renderSmart();}); }
  $('#'+qid).oninput=drawList; drawList();
  $('#entryAdd').onclick=()=>opts.add?.(); $('#entryClone').onclick=()=>opts.clone?.(); $('#entryDelete').onclick=()=>opts.remove?.();
  renderEditor(items[selectedEntry]||null);
}

function nearestHandlingReferences(item,limit=5){
  if(!item||!REF.handlingRecords?.length)return [];
  const keys=['fMass','fDriveBiasFront','fInitialDriveForce','fInitialDriveMaxFlatVel','fBrakeForce','fSteeringLock','fTractionCurveMax','fTractionCurveMin','fSuspensionForce','fAntiRollBarForce'];
  const vals={}; keys.forEach(k=>{const c=directChild(item,k);if(c&&c.hasAttribute('value')){const n=Number(c.getAttribute('value'));if(Number.isFinite(n))vals[k]=n;}});
  return REF.handlingRecords.map(r=>{let score=0,count=0;for(const k of keys){if(vals[k]==null||typeof r.values?.[k]!=='number')continue;const st=REF.handlingStats?.[k];const scale=Math.max(1e-6,(st?.p95??1)-(st?.p05??0));score+=Math.abs(vals[k]-r.values[k])/scale;count++;}return {name:r.name,score:count?score/count:999};}).sort((a,b)=>a.score-b.score).slice(0,limit);
}
function subHandlingHtml(item){
  const sh=directChild(item,'SubHandlingData'); if(!sh)return `<section class="section card"><h3>SubHandlingData</h3><div class="note">No SubHandlingData node exists. Use selected-entry XML if this vehicle needs a special car/bike/boat/flying/trailer/weapon sub-handler.</div></section>`;
  const rows=allChildren(sh,'Item').map((si,i)=>{
    const typ=si.getAttribute('type')||'NULL';
    if(typ==='NULL')return `<details class="subhandle"><summary>Slot ${i+1}: NULL</summary><div class="note">Unused sub-handling slot.</div></details>`;
    const fields=[...si.children].map(c=>{
      if(c.hasAttribute('value'))return `<div class="field"><label>${esc(c.tagName)}</label><input class="subfield mono" data-slot="${i}" data-tag="${esc(c.tagName)}" data-kind="value" value="${esc(c.getAttribute('value')||'')}"><small>${esc(typ)}</small></div>`;
      if(['x','y','z'].every(a=>c.hasAttribute(a)))return `<div class="field"><label>${esc(c.tagName)}</label><input class="subfield mono" data-slot="${i}" data-tag="${esc(c.tagName)}" data-kind="vector" value="${esc(['x','y','z'].map(a=>c.getAttribute(a)||'0').join(', '))}"><small>X, Y, Z · ${esc(typ)}</small></div>`;
      if(!c.children.length)return `<div class="field"><label>${esc(c.tagName)}</label><input class="subfield mono" data-slot="${i}" data-tag="${esc(c.tagName)}" data-kind="text" value="${esc(c.textContent.trim())}"><small>${esc(typ)}</small></div>`;
      return `<div class="field wide"><label>${esc(c.tagName)}</label><small>Complex nested field preserved in selected-entry XML.</small></div>`;
    }).join('');
    return `<details class="subhandle" open><summary>Slot ${i+1}: ${esc(typ)}</summary><div class="fields">${fields||'<div class="note">No editable scalar fields in this sub-handler.</div>'}</div></details>`;
  }).join('');
  return `<section class="section card"><h3>SubHandlingData</h3><p class="note">Specialized physics are edited in place and unknown fields remain untouched.</p>${rows}</section>`;
}
function hookSubHandling(doc,item){
  const sh=directChild(item,'SubHandlingData'); if(!sh)return;
  $$('.subfield').forEach(inp=>inp.onchange=()=>{const si=allChildren(sh,'Item')[+inp.dataset.slot];if(!si)return;const c=directChild(si,inp.dataset.tag);if(!c)return;if(inp.dataset.kind==='value')c.setAttribute('value',inp.value);else if(inp.dataset.kind==='vector'){const p=inp.value.split(/[ ,]+/).filter(Boolean);['x','y','z'].forEach((a,i)=>c.setAttribute(a,p[i]??'0'));}else c.textContent=inp.value;commitDoc(currentPath,doc);runDiagnostics();renderAll();});
}
function renderHandling(){
  const f=currentFile(); let doc;
  try{doc=parseXml(f.text)}catch(e){return renderBrokenXml(e)}
  const container=doc.querySelector('HandlingData');
  if(!container)return renderBrokenXml(new Error('Missing <HandlingData> container.'));
  const items=[...container.children].filter(n=>n.tagName==='Item' && (!n.getAttribute('type') || n.getAttribute('type')==='CHandlingData'));
  selectedEntry=Math.max(0,Math.min(selectedEntry,Math.max(0,items.length-1)));
  entryShell(items,it=>getText(it,'handlingName'), item=>{
    if(!item){$('#smartMain').innerHTML='<div class="card note">No handling entries. Add one to begin.</div>';return;}
    const name=getText(item,'handlingName'), exact=getHandlingReference(name), nearest=nearestHandlingReferences(item,5);
    const refBox=`<section class="section card reference-inline"><div class="section-title-row"><div><h3>GTA Reference Intelligence</h3><p>${exact?`Exact Rockstar reference found for <b>${esc(name)}</b>.`:'No exact reference name match; nearest handling profiles are shown below.'}</p></div><button id="openReference">Open Reference Lab</button></div><div class="reference-chips">${nearest.map((r,i)=>`<button class="ref-chip ${i===0?'best':''}" data-ref="${esc(r.name)}">${esc(r.name)} <small>${r.score.toFixed(2)}</small></button>`).join('')}</div></section>`;
    $('#smartMain').innerHTML=refBox+HANDLING_GROUPS.map(g=>`<section class="section card"><h3>${esc(g.name)}</h3><div class="fields">${g.fields.map(def=>handlingFieldHtml(item,def)).join('')}</div></section>`).join('')+subHandlingHtml(item)+itemRawBlock('Selected CHandlingData XML');
    $$('.hfield').forEach(inp=>inp.onchange=()=>{
      const def=HANDLING_GROUPS.flatMap(g=>g.fields).find(x=>x[0]===inp.dataset.name); if(!def)return;
      writeHandlingField(doc,item,def,inp.value); commitDoc(currentPath,doc); runDiagnostics(); renderAll();
    });
    hookSubHandling(doc,item); hookSelectedRaw(doc,item);
    $('#openReference').onclick=()=>{switchTab('reference');selectReference(name||nearest[0]?.name||'');renderReference();};
    $$('.ref-chip').forEach(b=>b.onclick=()=>{switchTab('reference');selectReference(b.dataset.ref);renderReference();});
  },{
    add:()=>{const temp=parseXml(TEMPLATES['handling.meta']).querySelector('HandlingData > Item');const n=doc.importNode(temp,true);let base='NEWHANDLING',i=2,names=new Set(items.map(x=>getText(x,'handlingName').toUpperCase()));while(names.has(base))base='NEWHANDLING'+i++;setText(doc,n,'handlingName',base);container.appendChild(n);commitDoc(currentPath,doc);selectedEntry=items.length;runDiagnostics();renderAll();},
    clone:()=>cloneXmlEntry(doc,container,items[selectedEntry], 'handlingName', true),
    remove:()=>removeXmlEntry(doc,items[selectedEntry])
  });
}
function handlingFieldHtml(item,def){
  const [name,type,min,max,help]=def; let value=''; const c=directChild(item,name);
  if(c){ if(type==='vector') value=['x','y','z'].map(a=>c.getAttribute(a)||'0').join(', '); else value=c.hasAttribute('value')?c.getAttribute('value'):c.textContent.trim(); }
  let state=null; if(type==='number'||type==='integer'){state=hardRuleState(name,value)||empiricalState(name,value)}
  const cls=state?.level==='error'?'bad':state?.level==='warn'?'warn':'';
  const range=REF.handlingStats?.[name]; const meta=state?.text || (range?`GTA median ${fmtNum(range.median)}`:'');
  return `<div class="field ${cls}"><label>${esc(name)}${range?`<span>${fmtNum(range.min)}…${fmtNum(range.max)} GTA</span>`:''}</label><input class="hfield mono" data-name="${esc(name)}" value="${esc(value)}"><small>${esc(help)}${meta?` · ${esc(meta)}`:''}</small></div>`;
}
function writeHandlingField(doc,item,def,val){
  const [name,type]=def; let c=directChild(item,name); if(!c){c=doc.createElement(name);item.appendChild(c)}
  if(type==='vector'){const p=val.split(/[ ,]+/).filter(Boolean);['x','y','z'].forEach((a,i)=>c.setAttribute(a,p[i]??'0'));}
  else if(type==='text') c.textContent=val;
  else c.setAttribute('value',val);
}

function vehicleExtraFieldsHtml(item){
  const known=new Set(VEHICLE_GROUPS.flatMap(g=>g.fields.map(x=>x[0]))); const extras=[...item.children].filter(c=>!known.has(c.tagName));
  if(!extras.length)return '';
  const simple=[],complex=[];
  extras.forEach((c,i)=>{
    if(['x','y','z'].every(a=>c.hasAttribute(a))){simple.push(`<div class="field"><label>${esc(c.tagName)}</label><input class="vextra mono" data-tag="${esc(c.tagName)}" data-kind="vector" value="${esc(['x','y','z'].map(a=>c.getAttribute(a)||'0').join(', '))}"><small>Vector X, Y, Z</small></div>`);}
    else if(c.hasAttribute('value')&&!c.children.length){simple.push(`<div class="field"><label>${esc(c.tagName)}</label><input class="vextra mono" data-tag="${esc(c.tagName)}" data-kind="attr" value="${esc(c.getAttribute('value')||'')}"><small>value attribute</small></div>`);}
    else if(!c.children.length){simple.push(`<div class="field"><label>${esc(c.tagName)}</label><input class="vextra mono" data-tag="${esc(c.tagName)}" data-kind="text" value="${esc(c.textContent.trim())}"><small>${c.hasAttribute('content')?`content=${esc(c.getAttribute('content'))}`:'Text value'}</small></div>`);}
    else complex.push({c,i});
  });
  return `<section class="section card"><h3>All Other vehicles.meta Fields</h3><p class="note">Every direct scalar/vector field in the selected Rockstar item is exposed here, including fields not hard-coded into the app.</p><div class="fields">${simple.join('')||'<div class="note">No extra scalar fields.</div>'}</div>${complex.length?`<div class="nested-grid">${complex.map(({c,i})=>`<details class="nested-card"><summary>${esc(c.tagName)} <small>nested XML</small></summary><textarea class="nested-xml mono" data-tag="${esc(c.tagName)}" spellcheck="false">${esc(formatXml(new XMLSerializer().serializeToString(c)))}</textarea><button class="apply-nested primary" data-tag="${esc(c.tagName)}">Apply ${esc(c.tagName)}</button><div class="error-text nested-error" data-tag="${esc(c.tagName)}"></div></details>`).join('')}</div>`:''}</section>`;
}
function hookVehicleExtras(doc,item){
  $$('.vextra').forEach(inp=>inp.onchange=()=>{const c=directChild(item,inp.dataset.tag);if(!c)return;if(inp.dataset.kind==='attr')c.setAttribute('value',inp.value);else if(inp.dataset.kind==='vector'){const p=inp.value.split(/[ ,]+/).filter(Boolean);['x','y','z'].forEach((a,i)=>c.setAttribute(a,p[i]??'0'));}else c.textContent=inp.value;commitDoc(currentPath,doc);runDiagnostics();renderAll();});
  $$('.apply-nested').forEach(btn=>btn.onclick=()=>{const tag=btn.dataset.tag, ta=$(`.nested-xml[data-tag="${CSS.escape(tag)}"]`), err=$(`.nested-error[data-tag="${CSS.escape(tag)}"]`);try{const wrap=parseXml(`<root>${ta.value}</root>`), repl=wrap.documentElement.firstElementChild;if(!repl||repl.tagName!==tag)throw new Error(`Expected <${tag}> as the edited root.`);const old=directChild(item,tag);old.replaceWith(doc.importNode(repl,true));commitDoc(currentPath,doc);runDiagnostics();renderAll();toast(`${tag} updated.`);}catch(e){err.textContent=e.message;}});
}
function vehicleEnumLists(){
  const tags=['type','plateType','dashboardType','vehicleClass','wheelType','layout','cameraName','aimCameraName','bonnetCameraName','povCameraName','vfxInfoName','swankness'];
  return tags.map(tag=>{const vals=REF.vehicleEnums?.[tag]||[];return vals.length?`<datalist id="enum-${esc(tag)}">${vals.map(v=>`<option value="${esc(v)}"></option>`).join('')}</datalist>`:''}).join('');
}
function vehicleNumericChecks(v){
  const positive=['wheelScale','wheelScaleRear','defaultBodyHealth','visibleSpawnDistScale','trackerPathWidth','buoyancySphereSizeScale'];
  const nonnegative=['dirtLevelMin','dirtLevelMax','envEffScaleMin','envEffScaleMax','envEffScaleMin2','envEffScaleMax2','damageMapScale','damageOffsetScale','HDTextureDist','identicalModelSpawnDistance','maxNumOfSameColor','pretendOccupantsScale','weaponForceMult','frequency','maxNum','minSeatHeight'];
  for(const tag of positive){const c=directChild(v.node,tag);if(!c)continue;const n=Number(c.getAttribute('value'));if(!Number.isFinite(n)||n<=0)addDiag('error','VEHICLE_NUMBER',`Invalid ${tag}`,`${v.model||'(unnamed)'}: ${tag} must be a positive number.`,v.path);}
  for(const tag of nonnegative){const c=directChild(v.node,tag);if(!c)continue;const n=Number(c.getAttribute('value'));if(!Number.isFinite(n)||n<0)addDiag('error','VEHICLE_NUMBER',`Invalid ${tag}`,`${v.model||'(unnamed)'}: ${tag} must be a non-negative number.`,v.path);}
  for(const tag of ['maxNumOfSameColor','frequency','maxNum','identicalModelSpawnDistance']){const c=directChild(v.node,tag);if(c){const n=Number(c.getAttribute('value'));if(Number.isFinite(n)&&!Number.isInteger(n))addDiag('warn','VEHICLE_INTEGER',`${tag} is normally an integer`,`${v.model}: ${tag} is ${c.getAttribute('value')}. Verify that this was not a formatting/editing mistake.`,v.path);}}
  for(const tag of ['wheelScale','wheelScaleRear']){const c=directChild(v.node,tag);if(c){const n=Number(c.getAttribute('value'));if(Number.isFinite(n)&&n>5)addDiag('error','VEHICLE_LIMIT',`${tag} is implausibly large`,`${v.model}: ${tag}=${n}. Values this large are almost certainly corrupt or entered in the wrong units.`,v.path);}}
  const ws=Number(getAttrVal(v.node,'wheelScale')), wr=Number(getAttrVal(v.node,'wheelScaleRear'));if(Number.isFinite(ws)&&Number.isFinite(wr)&&Math.max(ws,wr)>0&&Math.max(ws,wr)/Math.max(0.000001,Math.min(ws,wr))>3)addDiag('warn','WHEEL_SCALE_SPLIT','Extreme front/rear wheel-scale mismatch',`${v.model}: wheelScale=${ws}, wheelScaleRear=${wr}. This can be intentional, but the difference is extreme.`,v.path);
  for(const [lo,hi,label] of [['dirtLevelMin','dirtLevelMax','dirt level'],['envEffScaleMin','envEffScaleMax','environment effect scale'],['envEffScaleMin2','envEffScaleMax2','secondary environment effect scale']]){const a=Number(getAttrVal(v.node,lo)),b=Number(getAttrVal(v.node,hi));if(Number.isFinite(a)&&Number.isFinite(b)&&a>b)addDiag('warn','VEHICLE_MINMAX',`${label} min exceeds max`,`${v.model}: ${lo} (${a}) is above ${hi} (${b}).`,v.path);}
  for(const c of [...v.node.children]){
    if(['x','y','z'].some(a=>c.hasAttribute(a))){for(const a of ['x','y','z'])if(c.hasAttribute(a)&&!Number.isFinite(Number(c.getAttribute(a))))addDiag('error','VEHICLE_VECTOR',`Invalid ${c.tagName} vector`,`${v.model}: ${c.tagName}.${a} is not numeric.`,v.path);}
    if(c.hasAttribute('value')){const raw=c.getAttribute('value');if(/^(should|Allow|bumpersNeed|needsRope)/.test(c.tagName)&&!['true','false'].includes(String(raw).toLowerCase()))addDiag('error','VEHICLE_BOOL',`Invalid boolean ${c.tagName}`,`${v.model}: ${c.tagName} should be true or false, not “${raw}”.`,v.path);}
  }
  const tint=getAttrVal(v.node,'diffuseTint');if(tint&&!/^0x[0-9a-f]{8}$/i.test(tint))addDiag('warn','DIFFUSE_TINT','Unusual diffuseTint format',`${v.model}: diffuseTint is “${tint}”; Rockstar vehicle entries normally use an 8-digit hexadecimal value such as 0x00FFFFFF.`,v.path);
  for(const [tag,prefix] of [['type','VEHICLE_TYPE_'],['vehicleClass','VC_'],['wheelType','VWT_'],['plateType','VPT_']]){const val=getText(v.node,tag);if(val&&!val.startsWith(prefix))addDiag('warn','VEHICLE_ENUM',`Unusual ${tag}`,`${v.model}: ${tag} “${val}” does not use the normal ${prefix} prefix. Verify the value.`,v.path);}
}
function cloneVehicleEntry(doc,container,item){
  if(!item)return;const n=item.cloneNode(true), old=getText(item,'modelName')||'vehicle';let i=2,candidate=old.replace(/\d+$/,'')+i,existing=new Set(allChildren(container,'Item').map(x=>getText(x,'modelName').toLowerCase()));while(existing.has(candidate.toLowerCase()))candidate=old.replace(/\d+$/,'')+(++i);
  setText(doc,n,'modelName',candidate.toLowerCase()); if(getText(n,'txdName').toLowerCase()===old.toLowerCase())setText(doc,n,'txdName',candidate.toLowerCase()); if(getText(n,'handlingId').toUpperCase()===old.toUpperCase())setText(doc,n,'handlingId',candidate.toUpperCase()); if(getText(n,'gameName').toUpperCase()===old.toUpperCase())setText(doc,n,'gameName',candidate.toUpperCase());
  container.appendChild(n);commitDoc(currentPath,doc);selectedEntry=allChildren(container,'Item').length-1;runDiagnostics();renderAll();
}
function renderVehicles(){
  const f=currentFile();let doc;try{doc=parseXml(f.text)}catch(e){return renderBrokenXml(e)}
  const container=doc.querySelector('InitDatas'); if(!container)return renderBrokenXml(new Error('Missing <InitDatas> container.'));
  const items=allChildren(container,'Item'); selectedEntry=Math.max(0,Math.min(selectedEntry,Math.max(0,items.length-1)));
  entryShell(items,it=>getText(it,'modelName'),item=>{
    if(!item){$('#smartMain').innerHTML='<div class="card note">No vehicle entries.</div>';return;}
    $('#smartMain').innerHTML=VEHICLE_GROUPS.map(g=>`<section class="section card"><h3>${esc(g.name)}</h3><div class="fields">${g.fields.map(def=>vehicleFieldHtml(item,def)).join('')}</div></section>`).join('')+vehicleExtraFieldsHtml(item)+itemRawBlock('Selected vehicles.meta Item XML')+vehicleEnumLists();
    $$('.vfield').forEach(inp=>inp.onchange=()=>{const def=VEHICLE_GROUPS.flatMap(g=>g.fields).find(x=>x[0]===inp.dataset.name); if(def[1]==='attr')setAttrVal(doc,item,def[0],inp.value);else setText(doc,item,def[0],inp.value);commitDoc(currentPath,doc);runDiagnostics();renderAll();});
    hookVehicleExtras(doc,item); hookSelectedRaw(doc,item);
  },{
    add:()=>{const temp=parseXml(TEMPLATES['vehicles.meta']).querySelector('InitDatas > Item');const n=doc.importNode(temp,true);const existing=new Set(items.map(x=>getText(x,'modelName').toLowerCase()));let name='newcar',i=2;while(existing.has(name))name='newcar'+i++;setText(doc,n,'modelName',name);setText(doc,n,'txdName',name);setText(doc,n,'handlingId',name.toUpperCase());setText(doc,n,'gameName',name.toUpperCase());container.appendChild(n);commitDoc(currentPath,doc);selectedEntry=items.length;runDiagnostics();renderAll();},
    clone:()=>cloneVehicleEntry(doc,container,items[selectedEntry]),remove:()=>removeXmlEntry(doc,items[selectedEntry])
  });
}
function vehicleFieldHtml(item,def){const [name,kind,help]=def;const val=kind==='attr'?getAttrVal(item,name):getText(item,name);const list=(REF.vehicleEnums?.[name]?.length)?` list="enum-${esc(name)}"`:'';return `<div class="field"><label>${esc(name)}</label><input class="vfield mono" data-name="${esc(name)}"${list} value="${esc(val)}"><small>${esc(help)}</small></div>`;}

function renderVariations(){
  const f=currentFile();let doc;try{doc=parseXml(f.text)}catch(e){return renderBrokenXml(e)}
  const container=doc.querySelector('variationData'); if(!container)return renderBrokenXml(new Error('Missing <variationData> container.'));
  const items=allChildren(container,'Item'); selectedEntry=Math.max(0,Math.min(selectedEntry,Math.max(0,items.length-1)));
  entryShell(items,it=>getText(it,'modelName'),item=>{
    if(!item){$('#smartMain').innerHTML='<div class="card note">No variation entries.</div>';return;}
    const kits=directChild(item,'kits')?allChildren(directChild(item,'kits'),'Item').map(x=>x.textContent.trim()):[];
    const colors=directChild(item,'colors')?allChildren(directChild(item,'colors'),'Item'):[];
    $('#smartMain').innerHTML=`<section class="section card"><h3>Identity & Bindings</h3><div class="fields">
      ${simpleInput('modelName',getText(item,'modelName'),'Model/spawn name. Must match vehicles.meta.')}
      ${simpleInput('lightSettings',getAttrVal(item,'lightSettings'),'Light settings ID from carcols.meta. 0 means default/none.','attr')}
      ${simpleInput('sirenSettings',getAttrVal(item,'sirenSettings'),'Siren settings ID from carcols.meta. 0 means default/none.','attr')}
      <div class="field"><label>Mod kits</label><input id="variationKits" class="mono" value="${esc(kits.join(', '))}"><small>Comma-separated kitName values from carcols.meta, such as 52000_mycar_modkit.</small></div>
    </div></section>
    <div class="summary-grid"><div class="summary-card card"><small>Color combinations</small><strong>${colors.length}</strong></div><div class="summary-card card"><small>Mod kit references</small><strong>${kits.length}</strong></div><div class="summary-card card"><small>Siren setting</small><strong>${esc(getAttrVal(item,'sirenSettings')||'0')}</strong></div><div class="summary-card card"><small>Light setting</small><strong>${esc(getAttrVal(item,'lightSettings')||'0')}</strong></div></div>
    <section class="section card"><div class="section-title-row"><div><h3>Color / Livery Data</h3><p>Edit the standard four color indices directly. Nested liveries remain intact and are also available in selected-entry XML.</p></div><button id="addColorCombo">Add color combination</button></div>
      <div class="color-grid">${colors.length?colors.map((ci,i)=>{const ind=directChild(ci,'indices'),vals=ind?numericTextArray(ind):[];return `<div class="color-row"><label>Combination ${i+1}</label><input class="color-indices mono" data-i="${i}" value="${esc(vals.join(', '))}" placeholder="primary, secondary, pearl, wheel"><button class="remove-color danger-soft" data-i="${i}">Remove</button></div>`}).join(''):'<div class="note">No color combinations are defined.</div>'}</div>
    </section>${itemRawBlock('Selected carvariations Item XML')}`;
    $$('.sfield').forEach(inp=>inp.onchange=()=>{if(inp.dataset.kind==='attr')setAttrVal(doc,item,inp.dataset.name,inp.value);else setText(doc,item,inp.dataset.name,inp.value);commitDoc(currentPath,doc);runDiagnostics();renderAll();});
    $('#variationKits').onchange=()=>{let k=directChild(item,'kits');if(!k){k=doc.createElement('kits');item.appendChild(k)} k.replaceChildren();$('#variationKits').value.split(',').map(s=>s.trim()).filter(Boolean).forEach(v=>{const n=doc.createElement('Item');n.textContent=v;k.appendChild(n)});commitDoc(currentPath,doc);runDiagnostics();renderAll();};
    $$('.color-indices').forEach(inp=>inp.onchange=()=>{const ci=colors[+inp.dataset.i];if(!ci)return;let ind=directChild(ci,'indices');if(!ind){ind=doc.createElement('indices');ind.setAttribute('content','char_array');ci.prepend(ind)}const vals=inp.value.split(/[ ,]+/).filter(Boolean);if(vals.some(v=>!/^[-+]?\d+$/.test(v))){toast('Color indices must be integers.');renderAll();return;}ind.textContent='\n            '+vals.join('\n            ')+'\n          ';commitDoc(currentPath,doc);runDiagnostics();renderAll();});
    $$('.remove-color').forEach(b=>b.onclick=()=>{colors[+b.dataset.i]?.remove();commitDoc(currentPath,doc);runDiagnostics();renderAll();});
    $('#addColorCombo').onclick=()=>{let c=directChild(item,'colors');if(!c){c=doc.createElement('colors');item.appendChild(c)}const temp=parseXml(TEMPLATES['carvariations.meta']).querySelector('colors > Item');c.appendChild(doc.importNode(temp,true));commitDoc(currentPath,doc);runDiagnostics();renderAll();};
    hookSelectedRaw(doc,item);
  },{
    add:()=>{const temp=parseXml(TEMPLATES['carvariations.meta']).querySelector('variationData > Item');const n=doc.importNode(temp,true);let name='newcar',i=2,existing=new Set(items.map(x=>getText(x,'modelName').toLowerCase()));while(existing.has(name))name='newcar'+i++;setText(doc,n,'modelName',name);container.appendChild(n);commitDoc(currentPath,doc);selectedEntry=items.length;runDiagnostics();renderAll();},
    clone:()=>cloneXmlEntry(doc,container,items[selectedEntry],'modelName',false),remove:()=>removeXmlEntry(doc,items[selectedEntry])
  });
}
function simpleInput(name,val,help,kind='text'){return `<div class="field"><label>${esc(name)}</label><input class="sfield mono" data-name="${esc(name)}" data-kind="${kind}" value="${esc(val)}"><small>${esc(help)}</small></div>`;}

function renderCarcols(){
  const f=currentFile();let doc;try{doc=parseXml(f.text)}catch(e){return renderBrokenXml(e)}
  const rows=[];
  [['Kits','modkit'],['Lights','light'],['Sirens','siren']].forEach(([containerName,kind])=>{
    const c=doc.querySelector(containerName); if(!c)return;
    allChildren(c,'Item').forEach((item,index)=>{
      const idEl=directChild(item,'id'); const id=idEl?(idEl.getAttribute('value')??idEl.textContent.trim()):'';
      const name=getText(item,'kitName')||getText(item,'name')||getText(item,'Name')||`Item ${index+1}`;
      rows.push({kind,containerName,item,id,name,index});
    });
  });
  selectedEntry=Math.max(0,Math.min(selectedEntry,Math.max(0,rows.length-1))); const sel=rows[selectedEntry]||null;
  const sectionCounts=[...doc.documentElement.children].map(c=>`${c.tagName}: ${allChildren(c,'Item').length}`).join(' · ');
  $('#smartTab').innerHTML=`<div class="summary-grid"><div class="summary-card card"><small>Mod kits</small><strong>${rows.filter(r=>r.kind==='modkit').length}</strong></div><div class="summary-card card"><small>Light settings</small><strong>${rows.filter(r=>r.kind==='light').length}</strong></div><div class="summary-card card"><small>Siren settings</small><strong>${rows.filter(r=>r.kind==='siren').length}</strong></div><div class="summary-card card"><small>ID collisions in project</small><strong>${diagnostics.filter(d=>d.code==='DUPLICATE_ID').length}</strong></div></div>
  <section class="section card"><h3>carcols IDs & Cross-file References</h3><p class="note">${esc(sectionCounts||'No top-level sections')}</p><div style="overflow:auto"><table class="id-table"><thead><tr><th>Pool</th><th>ID</th><th>Name / kitName</th><th>Variation refs</th><th></th></tr></thead><tbody>${rows.length?rows.map((r,i)=>`<tr class="${i===selectedEntry?'selected-row':''}"><td>${esc(r.kind)}</td><td><input class="id-input mono carcols-id" data-i="${i}" value="${esc(r.id)}"></td><td class="mono">${esc(r.name)}</td><td>${countVariationRefs(r)}</td><td><button class="carcols-edit" data-i="${i}">Edit</button></td></tr>`).join(''):'<tr><td colspan="5">No Kits/Lights/Sirens items in this file.</td></tr>'}</tbody></table></div></section>
  ${sel?`<section class="section card"><h3>Selected ${esc(sel.kind)} item</h3><div class="fields">${simpleInput('id',sel.id,'Identifier used by the relevant carvariations reference.')}<div class="field"><label>Name</label><input id="carcolsName" class="mono" value="${esc(sel.name)}"><small>${sel.kind==='modkit'?'kitName; its numeric prefix is synchronized when the ID changes.':'Name/name field when present.'}</small></div></div></section>${itemRawBlock(`Selected ${sel.containerName} Item XML`)}`:`<section class="section card"><h3>Advanced carcols editor</h3><p class="note">Use Raw File to edit other carcols sections such as wheel definitions.</p></section>`}`;
  $$('.carcols-id').forEach(inp=>inp.onchange=()=>{const r=rows[+inp.dataset.i];renumberCarcols(doc,r,inp.value);});
  $$('.carcols-edit').forEach(b=>b.onclick=()=>{selectedEntry=+b.dataset.i;renderSmart();});
  if(sel){
    const idBox=$('.sfield[data-name="id"]'); if(idBox)idBox.onchange=()=>renumberCarcols(doc,sel,idBox.value);
    $('#carcolsName').onchange=()=>{const tag=directChild(sel.item,'kitName')?'kitName':directChild(sel.item,'name')?'name':directChild(sel.item,'Name')?'Name':null;if(tag){setText(doc,sel.item,tag,$('#carcolsName').value);commitDoc(currentPath,doc);runDiagnostics();renderAll();}else toast('This item has no simple name field; edit it in selected XML.');};
    hookSelectedRaw(doc,sel.item);
  }
}

function countVariationRefs(r){let n=0;for(const [path,f] of files){if(basename(path).toLowerCase()!=='carvariations.meta')continue;try{const d=parseXml(f.text);if(r.kind==='modkit')n += $$('kits > Item',d).filter(x=>x.textContent.trim()===r.name).length;else{const tag=r.kind==='siren'?'sirenSettings':'lightSettings';n += $$(tag,d).filter(x=>(x.getAttribute('value')||'')===String(r.id)).length;}}catch{}}return n;}
function renumberCarcols(doc,row,newId){
  newId=String(newId).trim(); if(!/^\d+$/.test(newId)){toast('ID must be a non-negative integer.');renderSmart();return;}
  const oldId=String(row.id); const idEl=directChild(row.item,'id'); if(idEl){if(idEl.hasAttribute('value'))idEl.setAttribute('value',newId);else idEl.textContent=newId;}
  if(row.kind==='modkit'){
    const kit=directChild(row.item,'kitName'); if(kit){const oldName=kit.textContent.trim();const newName=/^\d+_/.test(oldName)?oldName.replace(/^\d+_/,newId+'_'):oldName;kit.textContent=newName; updateVariationKitRefs(oldName,newName);}
  } else updateVariationNumericRefs(row.kind,oldId,newId,dirname(currentPath));
  commitDoc(currentPath,doc);runDiagnostics();renderAll();toast(`${row.kind} ID changed ${oldId} → ${newId}; linked variation references were updated where matched.`);
}
function updateVariationKitRefs(oldName,newName){for(const [path,f] of files){if(basename(path).toLowerCase()!=='carvariations.meta')continue;try{const d=parseXml(f.text);let changed=false;$$('kits > Item',d).forEach(x=>{if(x.textContent.trim()===oldName){x.textContent=newName;changed=true}});if(changed){f.text=serializeXml(d);markDirty(path)}}catch{}}}
function updateVariationNumericRefs(kind,oldId,newId,scopeDir){const tag=kind==='siren'?'sirenSettings':'lightSettings';for(const [path,f] of files){if(basename(path).toLowerCase()!=='carvariations.meta')continue;if(scopeDir && dirname(path)!==scopeDir && [...files.keys()].some(p=>basename(p).toLowerCase()==='carvariations.meta'&&dirname(p)===scopeDir))continue;try{const d=parseXml(f.text);let changed=false;$$(tag,d).forEach(x=>{if((x.getAttribute('value')||'')===oldId){x.setAttribute('value',newId);changed=true}});if(changed){f.text=serializeXml(d);markDirty(path)}}catch{}}}

function genericNodeLabel(node,index,parentTag=''){
  const candidates=['name','Name','id','Id','modelName','layoutName','layout','handlingName','filename','fileType'];
  for(const k of candidates){const c=directChild(node,k);if(c){const v=c.getAttribute('value')||c.textContent.trim();if(v)return `${parentTag?parentTag+' · ':''}${v}`;}}
  const typ=node.getAttribute('type'); return `${parentTag?parentTag+' · ':''}${typ||node.tagName} ${index+1}`;
}
function renderGeneric(){
  const f=currentFile(); const def=inferDef(currentPath); let doc;try{doc=parseXml(f.text)}catch(e){return renderBrokenXml(e)}
  const root=doc.documentElement, groups=[]; [...root.children].forEach(c=>{const its=allChildren(c,'Item');if(its.length)its.forEach((it,i)=>groups.push({node:it,parent:c,parentTag:c.tagName,label:genericNodeLabel(it,i,c.tagName)}));});
  const itemCount=$$('Item',doc).length, tagCount=$$('*',doc).length; selectedEntry=Math.max(0,Math.min(selectedEntry,Math.max(0,groups.length-1)));
  const summary=`<div class="summary-grid"><div class="summary-card card"><small>Root element</small><strong style="font-size:15px" class="mono">${esc(root.tagName)}</strong></div><div class="summary-card card"><small>Total XML elements</small><strong>${tagCount}</strong></div><div class="summary-card card"><small>Item nodes</small><strong>${itemCount}</strong></div><div class="summary-card card"><small>FiveM data type</small><strong style="font-size:12px" class="mono">${esc(def.type)}</strong></div></div>`;
  if(!groups.length){$('#smartTab').innerHTML=summary+`<section class="section card"><h3>Structure-preserving XML mode</h3><p class="note">This file has no first-level Item collection that can be safely generalized. The full Raw File editor remains available and validates XML before applying changes.</p><button id="goRaw">Open Raw File editor</button></section>`;$('#goRaw').onclick=()=>switchTab('raw');return;}
  $('#smartTab').innerHTML=summary+`<div class="smart-layout"><aside class="entry-panel card"><div class="entry-toolbar"><input id="genericSearch" placeholder="Search XML items…"></div><div id="genericList" class="entry-list"></div><div class="entry-actions"><button id="genericClone">Clone selected</button><button id="genericDelete" class="danger">Delete selected</button></div></aside><div id="genericMain" class="smart-main"></div></div>`;
  const draw=()=>{const q=$('#genericSearch').value.toLowerCase();$('#genericList').innerHTML=groups.map((g,i)=>({g,i})).filter(x=>x.g.label.toLowerCase().includes(q)).map(x=>`<button class="generic-entry entry ${x.i===selectedEntry?'active':''}" data-i="${x.i}"><b>${esc(x.g.label)}</b><small>${esc(x.g.parentTag)}</small></button>`).join('');$$('.generic-entry').forEach(b=>b.onclick=()=>{selectedEntry=+b.dataset.i;renderSmart();});}; $('#genericSearch').oninput=draw;draw();
  const g=groups[selectedEntry]; $('#genericMain').innerHTML=`<section class="section card"><h3>${esc(g.label)}</h3><p class="note">Generic item editor for ${esc(g.parentTag)}. Every attribute and nested element is preserved.</p></section>${itemRawBlock('Selected XML Item')}`; hookSelectedRaw(doc,g.node);
  $('#genericClone').onclick=()=>{const n=g.node.cloneNode(true);g.parent.appendChild(n);commitDoc(currentPath,doc);selectedEntry=groups.length;runDiagnostics();renderAll();};
  $('#genericDelete').onclick=()=>removeXmlEntry(doc,g.node);
}

function renderText(){
  const f=currentFile(); $('#smartTab').innerHTML=`<section class="section card"><h3>Text resource</h3><div class="raw-item"><p class="note">${esc(inferDef(currentPath).desc)}</p><button id="goRaw">Open text editor</button></div></section>`;$('#goRaw').onclick=()=>switchTab('raw');
}
function renderBrokenXml(err){ $('#smartTab').innerHTML=`<section class="section card"><h3>XML error</h3><div class="raw-item"><p class="error-text">${esc(err.message)}</p><button id="goRaw" class="primary">Open Raw File to repair</button></div></section>`;setTimeout(()=>{$('#goRaw')&&($('#goRaw').onclick=()=>switchTab('raw'))}); }
function itemRawBlock(title){return `<section class="section card"><h3>${esc(title)}</h3><div class="raw-item"><div class="raw-item-head"><small>Unknown/custom tags remain intact.</small><button id="applyItemRaw" class="primary">Apply selected-entry XML</button></div><textarea id="selectedRaw" spellcheck="false"></textarea><div id="selectedRawError" class="error-text"></div></div></section>`;}
function hookSelectedRaw(doc,item){
  $('#selectedRaw').value=formatXml(new XMLSerializer().serializeToString(item));
  $('#applyItemRaw').onclick=()=>{try{const wrap=parseXml(`<root>${$('#selectedRaw').value}</root>`);const replacement=wrap.documentElement.firstElementChild;if(!replacement)throw new Error('No XML element found.');const imported=doc.importNode(replacement,true);item.replaceWith(imported);commitDoc(currentPath,doc);runDiagnostics();renderAll();toast('Selected XML entry updated.');}catch(e){$('#selectedRawError').textContent=e.message;}};
}
function cloneXmlEntry(doc,container,item,key,upper){if(!item)return;const n=item.cloneNode(true);let base=(getText(item,key)||'copy').replace(/\d+$/,'');let i=2,existing=new Set(allChildren(container,'Item').map(x=>getText(x,key).toLowerCase()));let candidate=(base+i);while(existing.has(candidate.toLowerCase()))candidate=base+(++i);setText(doc,n,key,upper?candidate.toUpperCase():candidate.toLowerCase());container.appendChild(n);commitDoc(currentPath,doc);selectedEntry=allChildren(container,'Item').length-1;runDiagnostics();renderAll();}
function removeXmlEntry(doc,item){if(!item)return;if(!confirm('Delete this selected entry?'))return;item.remove();commitDoc(currentPath,doc);selectedEntry=Math.max(0,selectedEntry-1);runDiagnostics();renderAll();}

function renderSmart(){
  const f=currentFile(); if(!f){$('#smartTab').innerHTML='<div class="card note">No file selected.</div>';return;}
  const mode=inferDef(currentPath).smart;
  if(mode==='handling')renderHandling();else if(mode==='vehicles')renderVehicles();else if(mode==='variations')renderVariations();else if(mode==='carcols')renderCarcols();else if(mode==='generic')renderGeneric();else renderText();
}

function renderRaw(){const f=currentFile();if(!f)return;$('#rawEditor').value=f.text;$('#rawError').textContent='';$('#formatRawBtn').disabled=!isXmlFile(currentPath);}
function applyRaw(){const f=currentFile();if(!f)return;const text=$('#rawEditor').value;try{if(isXmlFile(currentPath)){const d=parseXml(text),def=inferDef(currentPath);if(def.root && d.documentElement.tagName!==def.root)throw new Error(`Expected root <${def.root}> but found <${d.documentElement.tagName}>.`);}f.text=text;markDirty();selectedEntry=0;runDiagnostics();renderAll();toast(`${basename(currentPath)} updated.`);}catch(e){$('#rawError').textContent=e.message;}}
function formatRawCurrent(){try{const d=parseXml($('#rawEditor').value);$('#rawEditor').value=serializeXml(d);$('#rawError').textContent='';}catch(e){$('#rawError').textContent=e.message;}}

function addDiag(level,code,title,message,path=''){diagnostics.push({level,code,title,message,path});}
function findManifestPath(){return [...files.keys()].find(p=>basename(p).toLowerCase()==='fxmanifest.lua')||[...files.keys()].find(p=>basename(p).toLowerCase()==='__resource.lua')||'';}
function parseManifest(text){
  const regs=[], listed=new Set(); let m;
  const re=/\bdata_file\s*(?:\(\s*)?['"]([^'"]+)['"]\s*\)?\s*(?:\(\s*)?['"]([^'"]+)['"]/gi;
  while((m=re.exec(text)))regs.push({type:m[1],path:normalizePath(m[2])});
  const fb=/\bfiles\s*\{([\s\S]*?)\}/gi; while((m=fb.exec(text))){const q=/['"]([^'"]+)['"]/g;let x;while((x=q.exec(m[1])))listed.add(normalizePath(x[1]));}
  return {regs,listed};
}
function globToRegExp(pattern){
  const p=normalizePath(pattern);let src='^';
  for(let i=0;i<p.length;){
    const c=p[i];
    if(c==='*'&&p[i+1]==='*'){if(p[i+2]==='/'){src+='(?:.*/)?';i+=3;}else{src+='.*';i+=2;}continue;}
    if(c==='*'){src+='[^/]*';i++;continue;}
    if(c==='?'){src+='[^/]';i++;continue;}
    src+=/[.+^${}()|[\]\\]/.test(c)?'\\'+c:c;i++;
  }
  return new RegExp(src+'$','i');
}
function manifestPatternMatches(pattern,path){
  try{return globToRegExp(pattern).test(normalizePath(path));}catch{return normalizePath(pattern).toLowerCase()===normalizePath(path).toLowerCase();}
}
function manifestRegFor(m,path){return m.regs.find(r=>manifestPatternMatches(r.path,path));}
function manifestListsPath(m,path){return [...m.listed].some(p=>manifestPatternMatches(p,path));}
function manifestTypeAccepted(def,type){return type===def.type || (def.aliases||[]).includes(type);}
function numericTextArray(node){return (node?.textContent||'').trim().split(/\s+/).filter(Boolean).map(Number);}
function runDiagnostics(){
  diagnostics=[];
  const docs=new Map();
  for(const [path,f] of files){
    if(!isXmlFile(path))continue;
    const def=inferDef(path);
    try{const d=parseXml(f.text);docs.set(path,d);if(def.root&&d.documentElement.tagName!==def.root)addDiag('error','WRONG_ROOT','Unexpected XML root',`${basename(path)} should normally use <${def.root}> but contains <${d.documentElement.tagName}>.`,path);}
    catch(e){addDiag('error','XML_PARSE','Malformed XML',e.message,path);}
  }

  const handlings=[]; for(const [p,d] of docs)if(inferDef(p).smart==='handling')$$('HandlingData > Item',d).forEach(x=>handlings.push({name:getText(x,'handlingName'),path:p,node:x}));
  const vehicles=[]; for(const [p,d] of docs)if(inferDef(p).smart==='vehicles')$$('InitDatas > Item',d).forEach(x=>vehicles.push({model:getText(x,'modelName'),txd:getText(x,'txdName'),handling:getText(x,'handlingId'),game:getText(x,'gameName'),layout:getText(x,'layout'),type:getText(x,'type'),vclass:getText(x,'vehicleClass'),path:p,node:x}));
  const vars=[]; for(const [p,d] of docs)if(inferDef(p).smart==='variations')$$('variationData > Item',d).forEach(x=>vars.push({model:getText(x,'modelName'),kits:directChild(x,'kits')?allChildren(directChild(x,'kits'),'Item').map(k=>k.textContent.trim()):[],light:getAttrVal(x,'lightSettings')||'0',siren:getAttrVal(x,'sirenSettings')||'0',path:p,node:x}));
  const ids={modkit:[],light:[],siren:[]};
  for(const [p,d] of docs)if(inferDef(p).smart==='carcols'){
    [['Kits','modkit'],['Lights','light'],['Sirens','siren']].forEach(([tag,kind])=>{const c=d.querySelector(tag);if(!c)return;allChildren(c,'Item').forEach(x=>{const idEl=directChild(x,'id');const id=idEl?(idEl.getAttribute('value')??idEl.textContent.trim()):'';const name=getText(x,'kitName')||getText(x,'name')||getText(x,'Name');ids[kind].push({id:String(id),name,path:p,node:x});});});
  }

  function duplicates(list,key,label,code='DUPLICATE_NAME'){const m=new Map();list.forEach(x=>{const k=(x[key]||'').toLowerCase();if(!k)return;(m.get(k)||m.set(k,[]).get(k)).push(x)});for(const [,a] of m)if(a.length>1)a.forEach(x=>addDiag('error',code,`Duplicate ${label}`,`${x[key]} appears ${a.length} times across the loaded resource.`,x.path));}
  duplicates(handlings,'name','handlingName'); duplicates(vehicles,'model','vehicle modelName'); duplicates(vars,'model','carvariations modelName');
  for(const kind of ['modkit','light','siren']){const m=new Map();ids[kind].forEach(x=>{if(!x.id)return;(m.get(x.id)||m.set(x.id,[]).get(x.id)).push(x)});for(const [id,a] of m)if(a.length>1)a.forEach(x=>addDiag('error','DUPLICATE_ID',`Duplicate ${kind} ID ${id}`,`${a.length} carcols entries claim ${kind} ID ${id}. This can cause overrides or wrong lights/mods.`,x.path));}

  // Handling structural, numeric and relational checks.
  handlings.forEach(h=>{
    if(!h.name)addDiag('error','MISSING_HANDLING_NAME','Missing handlingName','A CHandlingData entry has no handlingName.',h.path);
    for(const c of [...h.node.children]){
      if(!c.hasAttribute('value'))continue; const raw=c.getAttribute('value');
      if((REF.handlingStats?.[c.tagName]||/^f|^n/.test(c.tagName))&&!Number.isFinite(Number(raw)))addDiag('error','HANDLING_NUMBER',`Invalid ${c.tagName}`,`${h.name||'(unnamed)'} has non-numeric value “${raw}”.`,h.path);
      const hard=hardRuleState(c.tagName,raw);if(hard)addDiag('error','HANDLING_LIMIT',`${c.tagName} is invalid`,`${h.name||'(unnamed)'}: ${hard.text} Current value: ${raw}.`,h.path);
      const emp=empiricalState(c.tagName,raw);if(emp?.level==='warn'&&!hard)addDiag('warn','GTA_RANGE',`${c.tagName} outside GTA reference range`,`${h.name||'(unnamed)'} uses ${raw}; supplied GTA reference range is ${fmtNum(REF.handlingStats[c.tagName].min)}–${fmtNum(REF.handlingStats[c.tagName].max)}. This may be intentional, but it is unusually extreme.`,h.path);
    }
    const tmax=Number(getAttrVal(h.node,'fTractionCurveMax')), tmin=Number(getAttrVal(h.node,'fTractionCurveMin')); if(Number.isFinite(tmax)&&Number.isFinite(tmin)&&tmax<tmin)addDiag('warn','TRACTION_ORDER','Traction max is below traction min',`${h.name}: fTractionCurveMax (${tmax}) is below fTractionCurveMin (${tmin}). This is unusual for road vehicles, but the supplied Rockstar data contains at least one legitimate exception.`,h.path);
    const up=Number(getAttrVal(h.node,'fSuspensionUpperLimit')), low=Number(getAttrVal(h.node,'fSuspensionLowerLimit')); if(Number.isFinite(up)&&Number.isFinite(low)&&up<low)addDiag('error','SUSPENSION_TRAVEL','Suspension limits are reversed',`${h.name}: upper limit ${up} is below lower limit ${low}. Equal limits can be valid on some Rockstar specialty vehicles.`,h.path);
    const vec=directChild(h.node,'vecInertiaMultiplier');if(vec){for(const a of ['x','y','z']){const n=Number(vec.getAttribute(a));if(!Number.isFinite(n)||n<=0)addDiag('error','INERTIA_VECTOR','Invalid inertia multiplier',`${h.name}: vecInertiaMultiplier ${a.toUpperCase()} must be a positive number.`,h.path);}}
  });

  const handlingExact=new Set(handlings.map(x=>x.name)), handlingFold=new Map(handlings.filter(x=>x.name).map(x=>[x.name.toLowerCase(),x.name]));
  const vehicleExact=new Set(vehicles.map(x=>x.model)), varExact=new Set(vars.map(x=>x.model));
  const kits=new Set(ids.modkit.map(x=>x.name).filter(Boolean)), lights=new Set(ids.light.map(x=>x.id)), sirens=new Set(ids.siren.map(x=>x.id));
  const assetNames=new Set([...assets.keys()].map(p=>basename(p).toLowerCase()));
  const haveAssets=assets.size>0;

  vehicles.forEach(v=>{
    if(!v.model)addDiag('error','MISSING_MODEL','Missing modelName','vehicles.meta entry has no modelName.',v.path);
    if(v.model&&!/^[a-zA-Z0-9_]+$/.test(v.model))addDiag('warn','MODEL_CHARS','Unusual modelName characters',`${v.model} contains characters outside letters, digits and underscore. Verify the streamed archetype name.`,v.path);
    if(!v.txd)addDiag('warn','MISSING_TXD','Missing txdName',`${v.model||'(unnamed)'} has no txdName.`,v.path);
    if(!v.handling)addDiag('error','MISSING_HANDLING_REF','Missing handlingId',`${v.model||'(unnamed)'} has no handlingId.`,v.path);
    else if(handlings.length&&!handlingExact.has(v.handling)){
      const caseMatch=handlingFold.get(v.handling.toLowerCase()); if(caseMatch)addDiag('warn','HANDLING_CASE','handlingId case differs',`${v.model} references ${v.handling}, while loaded handlingName is ${caseMatch}. Match them exactly for a clean resource.`,v.path);
      else if(getHandlingReference(v.handling))addDiag('warn','BASE_HANDLING_REF','handlingId uses supplied GTA reference',`${v.model} references ${v.handling}, which exists in the embedded GTA reference but not in this resource's handling.meta. This is valid only if you intend to use the base-game handling.`,v.path);
      else addDiag('warn','HANDLING_REF','Unresolved handling reference',`${v.model||'(unnamed)'} references handlingId ${v.handling}, but no matching handlingName is loaded or present in the supplied GTA reference. It may come from another GTA/DLC data set; verify before shipping this resource.`,v.path);
    } else if(!handlings.length&&!getHandlingReference(v.handling)) addDiag('warn','HANDLING_UNVERIFIED','Cannot verify handlingId',`${v.model} references ${v.handling}, but no handling.meta is loaded and that name is not in the supplied GTA reference.`,v.path);
    if(vars.length&&v.model&&!varExact.has(v.model))addDiag('warn','VARIATION_REF','No carvariations entry',`${v.model} has no exact modelName match in loaded carvariations.meta files.`,v.path);
    if(v.txd&&v.model&&v.txd.toLowerCase()!==v.model.toLowerCase())addDiag('warn','TXD_DIFF','txdName differs from modelName',`${v.model} uses txdName ${v.txd}. This can be valid, but verify the streamed YTD dictionary.`,v.path);
    const lod=directChild(v.node,'lodDistances');if(lod){const a=numericTextArray(lod);if(a.some(x=>!Number.isFinite(x)))addDiag('error','LOD_NUMBER','Invalid lodDistances',`${v.model}: lodDistances contains a non-numeric value.`,v.path);else if(a.some(x=>x<0))addDiag('error','LOD_NEGATIVE','Negative lodDistances',`${v.model}: LOD distances cannot be negative.`,v.path);else if(a.some((x,i)=>i&&x<a[i-1]))addDiag('warn','LOD_ORDER','lodDistances are not increasing',`${v.model}: LOD distances normally increase from near to far.`,v.path);}
    vehicleNumericChecks(v);
    if(haveAssets&&v.model&&!assetNames.has(`${v.model.toLowerCase()}.yft`))addDiag('error','MODEL_ASSET','Missing streamed YFT',`${v.model}: no ${v.model}.yft was found in the imported resource.`,v.path);
    if(haveAssets&&v.txd&&!assetNames.has(`${v.txd.toLowerCase()}.ytd`))addDiag('warn','TXD_ASSET','Missing streamed YTD',`${v.model}: no ${v.txd}.ytd was found. This can be valid if the vehicle intentionally inherits an existing texture dictionary.`,v.path);
  });

  vars.forEach(v=>{
    if(vehicles.length&&v.model&&!vehicleExact.has(v.model))addDiag('warn','VEHICLE_REF','Variation without vehicle entry',`${v.model} appears in carvariations.meta but not in loaded vehicles.meta.`,v.path);
    v.kits.filter(k=>k&&k!=='0_default_modkit').forEach(k=>{if(ids.modkit.length&&!kits.has(k))addDiag('error','KIT_REF','Missing mod-kit reference',`${v.model} references ${k}, but that kitName is not present in loaded carcols.meta.`,v.path);else if(!ids.modkit.length)addDiag('warn','KIT_UNVERIFIED','Cannot verify mod-kit reference',`${v.model} references ${k}, but no carcols.meta is loaded.`,v.path);});
    if(!/^\d+$/.test(v.light))addDiag('error','LIGHT_NUMBER','Invalid lightSettings',`${v.model}: lightSettings must be an integer ID.`,v.path);
    if(!/^\d+$/.test(v.siren))addDiag('error','SIREN_NUMBER','Invalid sirenSettings',`${v.model}: sirenSettings must be an integer ID.`,v.path);
    if(v.light!=='0'&&ids.light.length&&!lights.has(v.light))addDiag('error','LIGHT_REF','Missing lightSettings ID',`${v.model} references lightSettings ${v.light}, not found in loaded carcols.meta.`,v.path);
    if(v.siren!=='0'&&ids.siren.length&&!sirens.has(v.siren))addDiag('error','SIREN_REF','Missing sirenSettings ID',`${v.model} references sirenSettings ${v.siren}, not found in loaded carcols.meta.`,v.path);
    const colors=directChild(v.node,'colors');if(colors)allChildren(colors,'Item').forEach((ci,i)=>{const ind=directChild(ci,'indices');if(ind){const a=numericTextArray(ind);if(a.some(n=>!Number.isInteger(n)))addDiag('error','COLOR_ARRAY','Invalid color index array',`${v.model}: color combination ${i+1} contains a non-integer index.`,v.path);else if(a.length&&a.length!==4)addDiag('warn','COLOR_COUNT','Unusual color index count',`${v.model}: color combination ${i+1} contains ${a.length} values; common vehicle color arrays use four.`,v.path);}});
  });

  const ssla=!!$('#sslaMode')?.checked;
  ids.light.forEach(x=>{const n=Number(x.id);if(!Number.isInteger(n)||n<0)addDiag('error','LIGHT_RANGE','Invalid lightSettings ID',`Light ID ${x.id} must be a non-negative integer.`,x.path);else if(n>255)addDiag('warn','LIGHT_RANGE_HIGH','High lightSettings ID',`Light ID ${x.id} is above the vanilla byte-sized range. This is used by some working emergency packs, but verify the value on the target server artifact and lighting stack.`,x.path);});
  ids.siren.forEach(x=>{const n=Number(x.id),max=ssla?65534:254;if(!Number.isInteger(n)||n<1)addDiag('error','SIREN_RANGE','Invalid sirenSettings ID',`Siren ID ${x.id} must be a positive integer.`,x.path);else if(n>max)addDiag('warn','SIREN_RANGE_HIGH','High sirenSettings ID',`Siren ID ${x.id} is outside ${ssla?'the common SSLA extended range 1–65534':'the vanilla-safe range 1–254'}. This can still be present in known-working converted emergency packs; keep it only when it matches carcols and has been tested on the target server.`,x.path);if(ssla&&[255,65535].includes(n))addDiag('error','SIREN_RESERVED','Reserved sirenSettings ID',`Siren ID ${x.id} is reserved and should not be used with SSLA.`,x.path);});
  ids.modkit.forEach(x=>{const n=Number(x.id);if(!Number.isInteger(n)||n<0||n>65535)addDiag('error','MODKIT_RANGE','mod-kit ID outside FiveM range',`Mod-kit ID ${x.id} is outside 0–65535.`,x.path);});

  // Resource/manifest checks. Preserve existing manifests; diagnose instead of blindly replacing them.
  const manifestPath=findManifestPath(); const expected=dataFileLines();
  if(!manifestPath)addDiag('warn','NO_MANIFEST','No resource manifest','No fxmanifest.lua/__resource.lua is loaded. Use Repair / merge manifest to create one.','fxmanifest.lua');
  else{
    if(basename(manifestPath).toLowerCase()==='__resource.lua')addDiag('warn','OLD_MANIFEST','Deprecated __resource.lua','FiveM still encounters legacy resources, but fxmanifest.lua is the current manifest format.',manifestPath);
    const m=parseManifest(files.get(manifestPath).text);
    expected.forEach(e=>{const r=manifestRegFor(m,e.path),def=inferDef(e.path);if(!r)addDiag('warn','MANIFEST_MISSING','Missing data_file registration',`${e.path} is loaded in the project but has no data_file '${e.type}' registration in ${basename(manifestPath)}.`,manifestPath);else if(!manifestTypeAccepted(def,r.type))addDiag('error','MANIFEST_TYPE','Wrong data_file type',`${e.path} is registered as ${r.type}, but the detected vehicle file type is ${e.type}.`,manifestPath);if(m.listed.size&&!manifestListsPath(m,e.path))addDiag('warn','MANIFEST_FILES','File absent from files{} block',`${e.path} is registered as vehicle data but is not covered by the parsed files { } entries.`,manifestPath);});
  }

  for(const path of files.keys()){if(basename(path).toLowerCase()==='vehiclemodelsets.meta')addDiag('warn','VEHICLEMODELSETS_RISK','Advanced vehiclemodelsets.meta loaded','FiveM has an open issue report involving crashes with some vehiclemodelsets.meta use cases. Keep this file only when the resource genuinely requires it and test the resource on your target artifact.',path);}
  if(vehicles.length&&!vars.length)addDiag('warn','NO_VARIATIONS','No carvariations.meta loaded','Many addon vehicles use carvariations.meta for colors, kits, light settings and siren settings. If the model depends on those, add/import the file.',vehicles[0].path);
  if(!diagnostics.length)addDiag('ok','CLEAN','No problems detected','XML, reference checks, streamed-asset checks and cross-file validation completed without a warning.');
  renderProjectState();renderDiagnostics();renderFileList();return diagnostics;
}

function renderDiagnostics(){
  const order={error:0,warn:1,ok:2},list=[...diagnostics].sort((a,b)=>order[a.level]-order[b.level]); const ec=list.filter(x=>x.level==='error').length,wc=list.filter(x=>x.level==='warn').length;
  $('#diagnosticsList').innerHTML=`<div class="summary-grid"><div class="summary-card card"><small>Errors</small><strong>${ec}</strong></div><div class="summary-card card"><small>Warnings</small><strong>${wc}</strong></div><div class="summary-card card"><small>Checks / messages</small><strong>${list.length}</strong></div><div class="summary-card card"><small>Reference records</small><strong>${REF.source?.handlingEntries||0}</strong></div></div>`+list.map((d,i)=>`<article class="diagnostic card ${d.level}"><span class="diag-icon">${d.level==='error'?'!':d.level==='warn'?'?':'✓'}</span><div><b>${esc(d.title)}</b><p>${esc(d.message)}</p></div><div class="diag-tail"><code>${esc(d.path||d.code)}</code>${d.path&&files.has(d.path)?`<button class="diag-open" data-path="${esc(d.path)}">Open</button>`:''}</div></article>`).join('');
  $$('.diag-open').forEach(b=>b.onclick=()=>{currentPath=b.dataset.path;selectedEntry=0;switchTab(isXmlFile(currentPath)?'smart':'raw');renderAll();});
}

function dataFileLines(){
  const priority=['CARCOLS_FILE','VEHICLE_VARIATION_FILE','CONTENT_UNLOCKING_META_FILE','HANDLING_FILE','VEHICLE_SHOP_DLC_FILE','VFXVEHICLEINFO_FILE','VEHICLEEXTRAS_FILE','AMBIENT_VEHICLE_MODEL_SET_FILE','VEHICLE_LAYOUTS_FILE','TEXTFILE_METAFILE','VEHICLE_METADATA_FILE'];
  const entries=[];
  for(const path of files.keys()){
    const def=inferDef(path); if(!priority.includes(def.type))continue;
    entries.push({type:def.type,path});
  }
  entries.sort((a,b)=>priority.indexOf(a.type)-priority.indexOf(b.type)||a.path.localeCompare(b.path));
  return entries;
}
function expectedManifestEntryFor(path,type='',expected=dataFileLines()){
  const normalized=normalizePath(path).toLowerCase();
  const exact=expected.find(e=>normalizePath(e.path).toLowerCase()===normalized);
  if(exact)return exact;
  const byBase=expected.filter(e=>basename(e.path).toLowerCase()===basename(path).toLowerCase());
  if(byBase.length===1){
    const candidate=byBase[0], def=inferDef(candidate.path);
    if(!type || manifestTypeAccepted(def,type) || isVehicleDataLikePath(path))return candidate;
  }
  return null;
}
function generateManifest(){
  const author=$('#authorInput')?.value||'CowBoyKeno', version=$('#versionInput')?.value||'4.0.0', description=$('#descriptionInput')?.value||'Vehicle resource built with CBK Vehicle Meta Studio';
  const data=dataFileLines(); const listed=[...new Set(data.map(x=>x.path))]; if(files.has('vehicle_names.lua')) listed.push('vehicle_names.lua');
  const lines=[`fx_version 'cerulean'`,`game 'gta5'`,``, `author '${author.replace(/'/g,"\\'")}'`,`description '${description.replace(/'/g,"\\'")}'`,`version '${version.replace(/'/g,"\\'")}'`,``, 'files {', ...listed.map(p=>`    '${p}',`), '}', ''];
  data.forEach(x=>lines.push(`data_file '${x.type}' '${x.path}'`)); if(files.has('vehicle_names.lua'))lines.push('',`client_script 'vehicle_names.lua'`); return lines.join('\n').trim()+"\n";
}
function mergedManifestText(existing){
  if(!existing?.trim())return generateManifest();
  const expected=dataFileLines(); let text=existing.replace(/\s+$/,'')+'\n';
  text=text.replace(/\bfiles\s*\{([\s\S]*?)\}/gi,(full,body)=>`files {${body.replace(/(['"])([^'"]+)\1/g,(m,q,path)=>{const e=expectedManifestEntryFor(path,'',expected);return e?`${q}${e.path}${q}`:m;})}}`);
  text=text.replace(/\bdata_file\s*(?:\(\s*)?['"]([^'"]+)['"]\s*\)?\s*(?:\(\s*)?['"]([^'"]+)['"]/gi,(full,type,path)=>{
    const e=expectedManifestEntryFor(path,type,expected), def=e?inferDef(e.path):null;
    if(!e||!def)return full;
    const nextType=manifestTypeAccepted(def,type)?type:e.type;
    return full.replace(type,nextType).replace(path,e.path);
  });
  const after=parseManifest(text);
  const missingFiles=expected.filter(e=>!manifestListsPath(after,e.path)).map(e=>e.path);
  const missingRegs=expected.filter(e=>{const r=manifestRegFor(after,e.path);return !r || !manifestTypeAccepted(inferDef(e.path),r.type);});
  if(missingFiles.length||missingRegs.length){text+=`\n-- CBK Vehicle Meta Studio: missing vehicle metadata registrations\n`;if(missingFiles.length)text+=`files {\n${missingFiles.map(p=>`    '${p}',`).join('\n')}\n}\n`;missingRegs.forEach(e=>text+=`data_file '${e.type}' '${e.path}'\n`);}
  if(files.has('vehicle_names.lua')&&!/\bclient_script\s*(?:\(\s*)?['"]vehicle_names\.lua['"]/i.test(text))text+=`\nclient_script 'vehicle_names.lua'\n`;
  return text.trim()+"\n";
}
function modernizeLegacyManifestText(existing){
  const body=String(existing||'')
    .replace(/^\s*resource_manifest_version\s+['"][^'"]+['"].*$/gmi,'')
    .trim();
  const lines=[];
  if(!/\bfx_version\s+['"][^'"]+['"]/i.test(body))lines.push(`fx_version 'cerulean'`);
  if(!/\bgame\s+['"][^'"]+['"]/i.test(body))lines.push(`game 'gta5'`);
  lines.push('',body);
  return mergedManifestText(lines.join('\n'));
}
function buildManifestText(){
  const fx=[...files.keys()].find(p=>basename(p).toLowerCase()==='fxmanifest.lua');
  if(fx)return {name:'fxmanifest.lua', text:mergedManifestText(files.get(fx).text), source:fx};
  const legacy=[...files.keys()].find(p=>basename(p).toLowerCase()==='__resource.lua');
  if(legacy)return {name:'fxmanifest.lua', text:modernizeLegacyManifestText(files.get(legacy).text), source:legacy};
  return {name:'fxmanifest.lua', text:generateManifest(), source:''};
}
function manifestPreviewText(){return buildManifestText().text;}
function refreshManifest(create=true){
  const built=buildManifestText(), existingPath=[...files.keys()].find(p=>basename(p).toLowerCase()==='fxmanifest.lua'), text=built.text;
  if($('#manifestPreview'))$('#manifestPreview').value=text;
  if(create){if(existingPath){files.get(existingPath).text=text;markDirty(existingPath);currentPath=existingPath;}else{makeFile('fxmanifest.lua',text,true);currentPath='fxmanifest.lua';}runDiagnostics();renderFileList();}
  return text;
}

function generateVehicleNames(){
  const rows=[]; for(const [p,f] of files){if(basename(p).toLowerCase()!=='vehicles.meta')continue;try{const d=parseXml(f.text);$$('InitDatas > Item',d).forEach(x=>{const model=getText(x,'modelName'),game=getText(x,'gameName')||model;if(model)rows.push({model,game})})}catch{}}
  const text=`CreateThread(function()\n${rows.map(r=>`    AddTextEntry(${JSON.stringify(r.model)}, ${JSON.stringify(r.game)})`).join('\n')}\nend)\n`;
  if(files.has('vehicle_names.lua')){files.get('vehicle_names.lua').text=text;markDirty('vehicle_names.lua')}else makeFile('vehicle_names.lua',text,true);refreshManifest(false);renderAll();toast(`Generated vehicle_names.lua with ${rows.length} entr${rows.length===1?'y':'ies'}.`);
}

function triggerDownloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
async function saveBlob(blob,name){
  if(window.showSaveFilePicker){
    try{
      const handle=await window.showSaveFilePicker({suggestedName:name});
      const writable=await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    }catch(e){
      if(e?.name==='AbortError')return false;
      console.warn('Direct save failed; falling back to browser download.',e);
    }
  }
  triggerDownloadBlob(blob,name);
  return true;
}
function downloadText(text,name,mime='text/plain'){return saveBlob(new Blob([text],{type:mime}),name)}
async function exportCurrent(){const f=currentFile();if(!f)return;const saved=await downloadText(f.text,basename(currentPath),isXmlFile(currentPath)?'application/xml':'text/plain');if(saved){f.dirty=false;renderAll();}}
function resourceOutputBaseName(){return ($('#projectName').value.trim()||'cbk_vehicle').replace(/[^a-zA-Z0-9_-]/g,'_');}
async function buildResourceEntries(){
  runDiagnostics(); const errors=diagnostics.filter(d=>d.level==='error'); if(errors.length&&!confirm(`Diagnostics found ${errors.length} error${errors.length===1?'':'s'}. Build the resource anyway?`))return null;
  const enc=new TextEncoder(), entries=[], forceGenerated=!!$('#preferGeneratedManifest')?.checked, manifest=forceGenerated?{name:'fxmanifest.lua',text:generateManifest()}:buildManifestText();
  for(const [path,f] of files){const b=basename(path).toLowerCase();if(b==='fxmanifest.lua'||b==='__resource.lua')continue;entries.push({name:canonicalProjectPath(path),bytes:enc.encode(f.text)});}
  entries.unshift({name:manifest.name,bytes:enc.encode(manifest.text)});
  if($('#includeAssets').checked){for(const [path,entry] of assets)entries.push({name:normalizePath(path),bytes:await assetBytes(entry)});}else if(assets.size&&!confirm(`This resource has ${assets.size} imported binary/stream file${assets.size===1?'':'s'} and they are excluded from the resource. Build metadata only?`))return null;
  return entries;
}
async function writeEntryToDirectory(rootHandle, entry){
  const parts=normalizePath(entry.name).split('/').filter(Boolean);
  if(!parts.length)return;
  let dir=rootHandle;
  for(const part of parts.slice(0,-1))dir=await dir.getDirectoryHandle(part,{create:true});
  const fileHandle=await dir.getFileHandle(parts[parts.length-1],{create:true});
  const writable=await fileHandle.createWritable();
  await writable.write(entry.bytes);
  await writable.close();
}
async function saveResourceFolder(){
  if(!window.showDirectoryPicker){alert('Direct folder export is not available in this browser. Use current Microsoft Edge or Chrome, or run the app from localhost, then try Save resource folder again.');return;}
  const entries=await buildResourceEntries(); if(!entries)return;
  try{
    const parent=await window.showDirectoryPicker({mode:'readwrite'});
    const resourceDir=await parent.getDirectoryHandle(resourceOutputBaseName(),{create:true});
    for(const entry of entries)await writeEntryToDirectory(resourceDir,entry);
    projectDirty=false;files.forEach(f=>f.dirty=false);renderAll();toast(`Saved ${resourceOutputBaseName()} folder with ${entries.length} file${entries.length===1?'':'s'}.`);
  }catch(e){
    if(e?.name==='AbortError')return;
    alert(`Could not save the resource folder:\n\n${e.message}`);
  }
}

// Tiny dependency-free ZIP writer (stored/uncompressed entries). This avoids CDN/runtime dependencies.
const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=CRC_TABLE[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}
function u16(n){return new Uint8Array([n&255,(n>>>8)&255])} function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255])}
function concatBytes(parts){const len=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(len);let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out}
async function makeZip(entries){
  const enc=new TextEncoder(), locals=[], centrals=[];let offset=0;
  for(const ent of entries){
    const name=enc.encode(normalizePath(ent.name)); const data=ent.bytes instanceof Uint8Array?ent.bytes:new Uint8Array(ent.bytes); const crc=crc32(data);
    const local=concatBytes([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);
    locals.push(local);
    const central=concatBytes([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
    centrals.push(central); offset+=local.length;
  }
  const centralBlob=concatBytes(centrals), end=concatBytes([u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(centralBlob.length),u32(offset),u16(0)]);
  return new Blob([...locals,centralBlob,end],{type:'application/zip'});
}
async function buildZip(){
  const entries=await buildResourceEntries(); if(!entries)return;
  const blob=await makeZip(entries), name=resourceOutputBaseName()+'.zip', saved=await saveBlob(blob,name); if(!saved)return;
  projectDirty=false;files.forEach(f=>f.dirty=false);renderAll();toast(`Built ${name} with ${entries.length} file${entries.length===1?'':'s'}. If Windows blocks the ZIP fallback download, use Save resource folder for local deployment.`);
}

function renderGuide(){
  const order=['handling.meta','vehicles.meta','carvariations.meta','carcols.meta','vehiclelayouts.meta','contentunlocks.meta','shop_vehicle.meta','dlctext.meta','vfxvehicleinfo.meta','vehiclemodelsets.meta','vehicleextras.dat'];
  $('#fileGuide').innerHTML=order.map(name=>{const d=FILE_DEFS[name];return `<div class="guide-file"><div><h4>${esc(name)}</h4><code>${esc(d.type)}</code></div><p>${esc(d.desc)}</p><span class="tag ${d.category==='Core'?'core':''}">${esc(d.category)}</span></div>`}).join('');
}
function renderTemplates(){
  const names=['handling.meta','vehicles.meta','carvariations.meta','carcols.meta','vehiclelayouts.meta','contentunlocks.meta','shop_vehicle.meta','dlctext.meta','vfxvehicleinfo.meta','vehiclemodelsets.meta','vehicleextras.dat'];
  $('#templateGrid').innerHTML=names.map(name=>{const d=FILE_DEFS[name],safe=SAFE_NEW_TEMPLATES.has(name);return `<button value="none" type="button" class="template-card ${safe?'':'template-import-only'}" data-name="${esc(name)}" ${safe?'':'disabled'}><b>${esc(name)}</b><span>${esc(safe?d.desc:'Import/edit supported. New blank creation is intentionally disabled because this advanced file should come from a known-good GTA/mod source.')}</span><code>${esc(d.type)}${safe?'':' · IMPORT'}</code></button>`}).join('');
  $$('.template-card:not([disabled])').forEach(b=>b.onclick=()=>addTemplateFile(b.dataset.name));
}
function addTemplateFile(name){
  const baseDir=['fxmanifest.lua','vehicle_names.lua'].includes(name)?'':'data/';let path=baseDir+name,i=2;
  while(files.has(path)){path=baseDir+name.replace(/(\.[^.]+)$/,(m)=>`_${i++}${m}`)}
  makeFile(path,TEMPLATES[name]??'',true);currentPath=path;selectedEntry=0;$('#addFileDialog').close();runDiagnostics();renderAll();toast(`Added ${path}.`);
}

function selectReference(name){
  const sel=$('#referenceSelect'); if(!sel)return; const wanted=String(name||'').toUpperCase(); const opt=[...sel.options].find(o=>o.value.toUpperCase()===wanted); if(opt)sel.value=opt.value;
}
function currentHandlingContext(){
  const def=inferDef(currentPath);
  try{
    if(def.smart==='handling'){const d=parseXml(currentFile().text),items=$$('HandlingData > Item',d),node=items[Math.max(0,Math.min(selectedEntry,items.length-1))];return node?{doc:d,node,name:getText(node,'handlingName'),path:currentPath}:null;}
    if(def.smart==='vehicles'){const vd=parseXml(currentFile().text),vs=$$('InitDatas > Item',vd),v=vs[Math.max(0,Math.min(selectedEntry,vs.length-1))],wanted=getText(v,'handlingId');if(wanted){for(const [path,f] of files){if(inferDef(path).smart!=='handling')continue;const d=parseXml(f.text),node=$$('HandlingData > Item',d).find(x=>getText(x,'handlingName')===wanted);if(node)return {doc:d,node,name:wanted,path};}}}
  }catch{}
  return null;
}
function renderReference(){
  const sel=$('#referenceSelect'), search=$('#referenceSearch'); if(!sel||!search)return;
  const q=search.value.trim().toLowerCase(), previous=sel.value; const records=(REF.handlingRecords||[]).filter(r=>!q||String(r.name).toLowerCase().includes(q));
  sel.innerHTML=records.map(r=>`<option value="${esc(r.name)}">${esc(r.name)}</option>`).join(''); if(records.some(r=>r.name===previous))sel.value=previous;
  const ref=getHandlingReference(sel.value)||records[0]||null; if(!ref){$('#referenceSummary').innerHTML='<div class="note">No reference handling records are available.</div>';return;}
  const cur=currentHandlingContext(), keys=[...new Set([...Object.keys(ref.values||{}),...(cur?[...cur.node.children].filter(c=>c.hasAttribute('value')).map(c=>c.tagName):[])])].filter(k=>typeof ref.values?.[k]==='number'||cur?.node&&directChild(cur.node,k)?.hasAttribute('value'));
  const rows=keys.map(k=>{const rv=ref.values?.[k], cv=cur?Number(getAttrVal(cur.node,k)):NaN, st=REF.handlingStats?.[k];const delta=Number.isFinite(cv)&&typeof rv==='number'?cv-rv:null;let status='';if(Number.isFinite(cv)){const hard=hardRuleState(k,cv),emp=empiricalState(k,cv);status=hard?.level==='error'?'Invalid':emp?.level==='warn'?'Outside GTA range':emp?.level==='notice'?'Unusual':'Normal range';}return `<tr><td class="mono">${esc(k)}</td><td>${rv==null?'—':fmtNum(rv)}</td><td>${Number.isFinite(cv)?fmtNum(cv):'—'}</td><td>${delta==null?'—':`${delta>0?'+':''}${fmtNum(delta)}`}</td><td>${st?`${fmtNum(st.p05)}–${fmtNum(st.p95)}`:'—'}</td><td>${esc(status)}</td></tr>`;}).join('');
  $('#referenceSummary').innerHTML=`<div class="summary-grid"><div class="summary-card card"><small>Reference handling</small><strong>${esc(ref.name)}</strong></div><div class="summary-card card"><small>Current handling</small><strong>${esc(cur?.name||'None selected')}</strong></div><div class="summary-card card"><small>GTA handling records</small><strong>${REF.source?.handlingEntries||REF.handlingRecords?.length||0}</strong></div><div class="summary-card card"><small>GTA vehicles sample</small><strong>${REF.source?.vehicleEntries||REF.vehicleRecords?.length||0}</strong></div></div><section class="section card"><div class="section-title-row"><div><h3>Handling comparison</h3><p>Reference bands come from the supplied OpenIV handling file; they are observations, not engine hard limits.</p></div>${cur?'<button id="applyReference" class="danger-soft">Apply reference values to current handling</button>':''}</div><div style="overflow:auto"><table class="id-table compare-table"><thead><tr><th>Field</th><th>${esc(ref.name)}</th><th>${esc(cur?.name||'Current')}</th><th>Delta</th><th>GTA 90% band</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  if(cur&&$('#applyReference'))$('#applyReference').onclick=()=>{if(!confirm(`Replace the tunable values of ${cur.name} with GTA reference ${ref.name}? The handlingName and unknown/custom fields will be preserved.`))return;for(const [k,v] of Object.entries(ref.values||{})){const c=directChild(cur.node,k);if(c?.hasAttribute('value')&&typeof v==='number')c.setAttribute('value',String(v));else if(c&&!c.children.length&&typeof v==='string')c.textContent=v;}for(const [k,v] of Object.entries(ref.vectors||{})){const c=directChild(cur.node,k);if(c)['x','y','z'].forEach(a=>c.setAttribute(a,String(v[a])));}commitDoc(cur.path||currentPath,cur.doc);runDiagnostics();renderAll();renderReference();toast(`Applied ${ref.name} reference values to ${cur.name}.`);};
}
function initReference(){
  if(!$('#referenceSelect'))return; $('#referenceSelect').innerHTML=(REF.handlingRecords||[]).map(r=>`<option value="${esc(r.name)}">${esc(r.name)}</option>`).join(''); $('#referenceSearch').oninput=renderReference; $('#referenceSelect').onchange=renderReference; $('#compareReferenceBtn').onclick=renderReference; renderReference();
}



// -----------------------------
// v4 Resource / spawn-code renamer
// -----------------------------
let renameLastPlan = null;

function detectedVehicleDefinitions(){
  const out=[];
  for(const [path,f] of files){
    if(inferDef(path).smart!=='vehicles')continue;
    try{
      const doc=parseXml(f.text);
      $$('InitDatas > Item',doc).forEach((node,index)=>{
        const model=getText(node,'modelName');
        if(model)out.push({path,index,model,txd:getText(node,'txdName'),handling:getText(node,'handlingId'),game:getText(node,'gameName')});
      });
    }catch{}
  }
  return out;
}
function preserveIdentifierCase(oldValue,newSpawn){
  const old=String(oldValue||''), n=String(newSpawn||'');
  const letters=old.replace(/[^A-Za-z]/g,'');
  if(letters && old===old.toUpperCase())return n.toUpperCase();
  if(letters && old===old.toLowerCase())return n.toLowerCase();
  return n;
}
function renameFormValues(){
  return {
    oldModel:$('#renameOldSpawn')?.value||'',
    resourceName:$('#renameResourceName')?.value.trim()||'',
    newSpawn:$('#renameNewSpawn')?.value.trim()||'',
    syncIdentity:!!$('#renameIdentityFields')?.checked,
    renameAssets:!!$('#renameStreamFiles')?.checked,
    updateNamesLua:!!$('#renameVehicleNamesLua')?.checked
  };
}
function refreshRenameTargets(force=false){
  const sel=$('#renameOldSpawn'); if(!sel)return;
  const defs=detectedVehicleDefinitions();
  const previous=sel.value;
  const unique=[]; const seen=new Set();
  defs.forEach(v=>{const k=v.model.toLowerCase();if(!seen.has(k)){seen.add(k);unique.push(v.model);}});
  sel.innerHTML=unique.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
  if(previous&&unique.some(m=>m===previous))sel.value=previous;
  else if(unique.length)sel.value=unique[0];
  if(force||!$('#renameResourceName').value)$('#renameResourceName').value=$('#projectName').value||'vehicle_resource';
  if(force||!$('#renameNewSpawn').value)$('#renameNewSpawn').value=sel.value||'';
  if(!unique.length){
    $('#renameReadyBadge').className='pill error';$('#renameReadyBadge').textContent='No vehicle';
    $('#renameMessage').className='note rename-message-error';$('#renameMessage').textContent='No vehicle modelName could be detected. Import a resource containing a valid vehicles.meta first.';
  }else{
    $('#renameReadyBadge').className='pill ok';$('#renameReadyBadge').textContent=unique.length===1?'1 vehicle':`${unique.length} vehicles`;
  }
}
function renameAssetDestination(path,oldModel,newSpawn,renameTxd){
  const b=basename(path), dot=b.lastIndexOf('.'); if(dot<1)return null;
  const stem=b.slice(0,dot), ext=b.slice(dot), low=stem.toLowerCase(), old=oldModel.toLowerCase(), extLow=ext.toLowerCase();
  if(!['.yft','.ytd'].includes(extLow))return null;
  let suffix=null;
  if(low===old)suffix=''; else if(low===old+'_hi')suffix='_hi'; else if(low===old+'+hi')suffix='+hi'; else return null;
  if(extLow==='.ytd'&&!renameTxd)return null;
  const dir=dirname(path), nb=newSpawn+suffix+ext;
  return dir?`${dir}/${nb}`:nb;
}
function updateVehicleNamesLua(text,oldModel,newSpawn,syncIdentity){
  let count=0;
  const re=/AddTextEntry\s*\(\s*(["'])([^"']+)\1\s*,\s*(["'])([^"']*)\3\s*\)/g;
  const next=String(text).replace(re,(full,q1,key,q2,label)=>{
    let nk=key,nl=label,changed=false;
    if(key.toLowerCase()===oldModel.toLowerCase()){nk=preserveIdentifierCase(key,newSpawn);changed=true;}
    if(syncIdentity&&label.toLowerCase()===oldModel.toLowerCase()){nl=preserveIdentifierCase(label,newSpawn);changed=true;}
    if(changed){count++;return `AddTextEntry(${q1}${nk}${q1}, ${q2}${nl}${q2})`;}
    return full;
  });
  return {text:next,count};
}
function buildRenamePlan(){
  const v=renameFormValues(), changes=[], warnings=[], errors=[], textUpdates=new Map(), assetMoves=[];
  const defs=detectedVehicleDefinitions(), oldLower=v.oldModel.toLowerCase(), newLower=v.newSpawn.toLowerCase();
  const targets=defs.filter(x=>x.model.toLowerCase()===oldLower);
  const plan={...v,changes,warnings,errors,textUpdates,assetMoves,targets};
  if(!v.oldModel)errors.push('Choose a detected current spawn code.');
  if(!targets.length)errors.push(`The selected spawn code “${v.oldModel||'(empty)'}” is not present in loaded vehicles.meta data.`);
  if(!v.resourceName)errors.push('Enter a new resource folder name.');
  else if(!/^[A-Za-z0-9_-]+$/.test(v.resourceName))errors.push('Resource folder name may contain only letters, numbers, underscore and hyphen.');
  if(!v.newSpawn)errors.push('Enter a new spawn code.');
  else if(!/^[A-Za-z0-9_]+$/.test(v.newSpawn))errors.push('Spawn code may contain only letters, numbers and underscore.');
  if(/[A-Z]/.test(v.newSpawn))warnings.push('Lowercase spawn codes are recommended for the least surprising cross-platform file naming behavior.');
  for(const [path,f] of files){if(!isXmlFile(path))continue;try{parseXml(f.text)}catch(e){errors.push(`Cannot safely rename while ${path} contains malformed XML: ${e.message}`);}}
  if(defs.some(x=>x.model.toLowerCase()===newLower&&x.model.toLowerCase()!==oldLower))errors.push(`Spawn code “${v.newSpawn}” already belongs to another loaded vehicle.`);
  if(errors.length)return plan;

  if(v.resourceName!==$('#projectName').value.trim()){
    const oldResource=$('#projectName').value.trim();
    changes.push({status:'change',path:'(resource)',field:'resource folder / ZIP name',old:oldResource,new:v.resourceName});
    warnings.push('Resource-folder renaming cannot update server.cfg ensure lines or references in other resources that were not uploaded. Update those external references if they use the old resource name.');
    if(oldResource){const refs=[...files].filter(([path,f])=>!['fxmanifest.lua','__resource.lua'].includes(basename(path).toLowerCase())&&String(f.text).includes(oldResource)).map(([path])=>path);if(refs.length)warnings.push(`The old resource name also appears inside ${refs.slice(0,3).join(', ')}${refs.length>3?` and ${refs.length-3} more file(s)`:''}. These references are intentionally not auto-replaced; review them if they are resource-name references.`);}
  }

  // Determine whether the selected vehicle's texture dictionary follows the spawn code.
  const renameTxd=v.syncIdentity&&targets.some(t=>t.txd&&t.txd.toLowerCase()===oldLower);
  const renameHandling=v.syncIdentity&&targets.some(t=>t.handling&&t.handling.toLowerCase()===oldLower);

  // Preflight semantic collisions before creating modified XML copies.
  if(renameHandling){
    for(const [path,f] of files){
      if(inferDef(path).smart!=='handling')continue;
      try{const d=parseXml(f.text);for(const n of $$('HandlingData > Item',d)){const h=getText(n,'handlingName');if(h&&h.toLowerCase()===newLower&&h.toLowerCase()!==oldLower)errors.push(`handlingName “${v.newSpawn}” already exists in ${path}.`);}}catch{}
    }
  }
  for(const [path,f] of files){
    if(inferDef(path).smart!=='variations')continue;
    try{const d=parseXml(f.text);for(const n of $$('variationData > Item',d)){const m=getText(n,'modelName');if(m&&m.toLowerCase()===newLower&&m.toLowerCase()!==oldLower)errors.push(`carvariations modelName “${v.newSpawn}” already exists in ${path}.`);}}catch{}
  }
  if(errors.length)return plan;

  const noteChange=(path,field,oldValue,newValue)=>{if(String(oldValue)===String(newValue))return;changes.push({status:'change',path,field,old:String(oldValue),new:String(newValue)});};
  const changeText=(path,el,newValue,field)=>{const old=el.textContent.trim();if(old===newValue)return false;noteChange(path,field,old,newValue);el.textContent=newValue;return true;};

  for(const [path,f] of files){
    if(!isXmlFile(path))continue;
    let doc;try{doc=parseXml(f.text)}catch{continue}
    const def=inferDef(path);let touched=false;
    if(def.smart==='vehicles'){
      $$('InitDatas > Item',doc).forEach((node,index)=>{
        const model=getText(node,'modelName');if(model.toLowerCase()!==oldLower)return;
        const me=directChild(node,'modelName'); if(me)touched=changeText(path,me,v.newSpawn,`vehicle ${index+1} · modelName`)||touched;
        if(v.syncIdentity){
          for(const tag of ['txdName','handlingId','gameName']){const el=directChild(node,tag);if(el&&el.textContent.trim().toLowerCase()===oldLower){const nv=tag==='txdName'?v.newSpawn:preserveIdentifierCase(el.textContent.trim(),v.newSpawn);touched=changeText(path,el,nv,`vehicle ${index+1} · ${tag}`)||touched;}}
        }
      });
      if(v.syncIdentity&&renameTxd){
        const rel=doc.querySelector('txdRelationships'); if(rel){[...rel.getElementsByTagName('child')].forEach((el,i)=>{if(el.textContent.trim().toLowerCase()===oldLower)touched=changeText(path,el,v.newSpawn,`txdRelationships child ${i+1}`)||touched;});}
      }
    }else if(def.smart==='variations'){
      $$('variationData > Item',doc).forEach((node,index)=>{const el=directChild(node,'modelName');if(el&&el.textContent.trim().toLowerCase()===oldLower)touched=changeText(path,el,v.newSpawn,`variation ${index+1} · modelName`)||touched;});
    }else if(def.smart==='handling'&&renameHandling){
      $$('HandlingData > Item',doc).forEach((node,index)=>{const el=directChild(node,'handlingName');if(el&&el.textContent.trim().toLowerCase()===oldLower)touched=changeText(path,el,preserveIdentifierCase(el.textContent.trim(),v.newSpawn),`handling ${index+1} · handlingName`)||touched;});
    }else{
      // Optional DLC/shop metas can also contain an exact modelName reference. Only that explicit tag is changed.
      [...doc.getElementsByTagName('modelName')].forEach((el,index)=>{if(el.textContent.trim().toLowerCase()===oldLower)touched=changeText(path,el,v.newSpawn,`modelName reference ${index+1}`)||touched;});
    }
    if(touched)textUpdates.set(path,serializeXml(doc));
  }

  if(v.updateNamesLua){
    for(const [path,f] of files){if(basename(path).toLowerCase()!=='vehicle_names.lua')continue;const u=updateVehicleNamesLua(f.text,v.oldModel,v.newSpawn,v.syncIdentity);if(u.count){textUpdates.set(path,u.text);noteChange(path,'AddTextEntry exact vehicle reference',`${v.oldModel} (${u.count} entr${u.count===1?'y':'ies'})`,`${v.newSpawn} (${u.count} entr${u.count===1?'y':'ies'})`);}}
  }

  if(v.renameAssets){
    const lowerPaths=new Map([...assets.keys()].map(p=>[p.toLowerCase(),p]));
    let yftRenames=0;
    for(const path of assets.keys()){
      const to=renameAssetDestination(path,v.oldModel,v.newSpawn,renameTxd); if(!to||to===path)continue;
      const collision=lowerPaths.get(to.toLowerCase());
      if(collision&&collision.toLowerCase()!==path.toLowerCase()){errors.push(`Cannot rename ${path} to ${to}: that target asset already exists.`);continue;}
      assetMoves.push({from:path,to});noteChange(path,'stream asset filename',basename(path),basename(to));if(/\.yft$/i.test(path))yftRenames++;
    }
    if(assets.size&&yftRenames===0)warnings.push(`No ${v.oldModel}.yft / ${v.oldModel}_hi.yft stream filenames were found to rename. The model may use an unusual asset name or the resource may be incomplete.`);
  }
  if(!changes.some(c=>c.field.includes('modelName'))&&oldLower!==newLower)warnings.push('No modelName field was changed. Check that the selected vehicle entry is valid and not malformed.');
  if(oldLower===newLower&&v.resourceName===$('#projectName').value.trim())warnings.push('The requested resource name and spawn code are already in use; there is nothing to rename.');
  return plan;
}
function renderRenamePlan(plan=buildRenamePlan()){
  renameLastPlan=plan; const body=$('#renamePreviewBody'), count=$('#renameChangeCount'), msg=$('#renameMessage'), badge=$('#renameReadyBadge');if(!body)return plan;
  const rows=[];
  plan.errors.forEach(e=>rows.push({status:'error',path:'Preflight',field:e,old:'—',new:'Blocked'}));
  plan.warnings.forEach(w=>rows.push({status:'warn',path:'Preflight',field:w,old:'—',new:'Review'}));
  plan.changes.forEach(c=>rows.push(c));
  body.innerHTML=rows.length?rows.map(r=>`<tr><td><span class="rename-status ${r.status}">${r.status==='change'?'CHANGE':r.status.toUpperCase()}</span></td><td>${esc(r.path)}</td><td>${esc(r.field)}</td><td>${esc(r.old)}</td><td>${esc(r.new)}</td></tr>`).join(''):'<tr><td colspan="5" class="muted-cell">No changes are required.</td></tr>';
  count.textContent=`${plan.changes.length} change${plan.changes.length===1?'':'s'}`;
  if(plan.errors.length){msg.className='note rename-message-error';msg.textContent=`Rename blocked: ${plan.errors.length} preflight error${plan.errors.length===1?'':'s'}. Fix the issues shown below before applying.`;badge.className='pill error';badge.textContent='Blocked';}
  else{msg.className=plan.warnings.length?'note':'note rename-message-ok';msg.textContent=`Safe preview ready: ${plan.changes.length} planned change${plan.changes.length===1?'':'s'}${plan.warnings.length?` with ${plan.warnings.length} warning${plan.warnings.length===1?'':'s'}`:''}. Unrelated scripts, IDs, layouts, light/siren settings and custom XML are not blanket-renamed.`;badge.className=plan.warnings.length?'pill warn':'pill ok';badge.textContent=plan.warnings.length?'Review':'Safe';}
  return plan;
}
function applyRenamePlan(){
  const plan=buildRenamePlan();renderRenamePlan(plan);if(plan.errors.length){toast('Rename blocked by preflight errors.');return false;}
  if(!plan.changes.length){toast('Nothing needs to be renamed.');return true;}
  const fileBackup=new Map([...files].map(([k,v])=>[k,{...v}])), assetBackup=new Map(assets), projectBackup=$('#projectName').value;
  try{
    for(const [path,text] of plan.textUpdates){const f=files.get(path);if(!f)throw new Error(`File disappeared during rename: ${path}`);f.text=text;f.dirty=true;}
    for(const mv of plan.assetMoves){const entry=assets.get(mv.from);if(!entry)throw new Error(`Asset disappeared during rename: ${mv.from}`);assets.delete(mv.from);assets.set(mv.to,entry);}
    $('#projectName').value=plan.resourceName;projectDirty=true;
    runDiagnostics();
    // Only rollback for errors introduced by broken XML/reference structure caused by the rename. Existing resource errors remain visible to the user.
    for(const [path,text] of plan.textUpdates){if(isXmlFile(path))parseXml(files.get(path).text);}
    refreshRenameTargets(false);$('#renameOldSpawn').value=plan.newSpawn;$('#renameNewSpawn').value=plan.newSpawn;$('#renameResourceName').value=plan.resourceName;
    renderAll();renderRenamePlan(buildRenamePlan());toast(`Renamed ${plan.oldModel} → ${plan.newSpawn}. Project output is now ${plan.resourceName}.zip.`);return true;
  }catch(e){
    files=fileBackup;assets=assetBackup;$('#projectName').value=projectBackup;projectDirty=true;runDiagnostics();renderAll();alert(`Rename was rolled back safely:\n\n${e.message}`);return false;
  }
}
function renderRenamer(){refreshRenameTargets(false);renderRenamePlan(buildRenamePlan());}

function switchTab(name){currentTab=name;$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));$$('.tab-panel').forEach(p=>p.classList.add('hidden'));$('#'+name+'Tab').classList.remove('hidden');if(name==='raw')renderRaw();if(name==='diagnostics'){runDiagnostics();renderDiagnostics()}if(name==='builder'){$('#manifestPreview').value=manifestPreviewText();}if(name==='renamer')renderRenamer();if(name==='reference')renderReference();}
function renderAll(){renderHeader();renderFileList();renderProjectState();if(currentTab==='smart')renderSmart();else if(currentTab==='raw')renderRaw();else if(currentTab==='diagnostics')renderDiagnostics();else if(currentTab==='builder')$('#manifestPreview').value=manifestPreviewText();else if(currentTab==='renamer')renderRenamer();else if(currentTab==='reference')renderReference();}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.add('hidden'),3500)}

$('#zipInput').addEventListener('change',e=>importZip(e.target.files?.[0]));
$('#fileInput').addEventListener('change',e=>importFiles(e.target.files,false));
$('#folderInput').addEventListener('change',e=>importFiles(e.target.files,true));
$('#newProjectBtn').onclick=()=>{if(projectDirty&&!confirm('Discard current project edits and start a new vehicle project?'))return;newProject();};
$('#exportCurrentBtn').onclick=exportCurrent; $('#saveFolderBtn').onclick=saveResourceFolder; $('#exportZipBtn').onclick=buildZip; $('#builderFolderBtn').onclick=saveResourceFolder; $('#builderZipBtn').onclick=buildZip;
$('#fileSearch').oninput=renderFileList; $('#projectName').oninput=()=>{projectDirty=true;renderProjectState()};
$('#addFileBtn').onclick=()=>$('#addFileDialog').showModal(); $('#manifestBtn').onclick=()=>{refreshManifest(true);currentPath='fxmanifest.lua';switchTab('raw');renderAll();toast('fxmanifest.lua generated from loaded data files.');};
$('#applyRawBtn').onclick=applyRaw; $('#formatRawBtn').onclick=formatRawCurrent; $('#runDiagnosticsBtn').onclick=runDiagnostics;
$('#refreshManifestBtn').onclick=()=>{$('#manifestPreview').value=refreshManifest(true);toast('fxmanifest.lua repaired/merged without removing existing script metadata.');}; $('#addNamesBtn').onclick=generateVehicleNames;
$('#sslaMode').onchange=()=>{runDiagnostics();if(currentTab==='diagnostics')renderDiagnostics();};
$('#previewRenameBtn').onclick=()=>renderRenamePlan(buildRenamePlan()); $('#applyRenameBtn').onclick=applyRenamePlan; $('#renameBuildBtn').onclick=()=>{if(applyRenamePlan())buildZip();};
$('#renameOldSpawn').onchange=()=>{$('#renameNewSpawn').value=$('#renameOldSpawn').value;renderRenamePlan(buildRenamePlan());};
['renameResourceName','renameNewSpawn','renameIdentityFields','renameStreamFiles','renameVehicleNamesLua'].forEach(id=>$('#'+id).addEventListener('input',()=>{renameLastPlan=null;}));
$$('.tab').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
window.addEventListener('beforeunload',e=>{if(projectDirty){e.preventDefault();e.returnValue='';}});

renderGuide();renderTemplates();initReference();newProject();
