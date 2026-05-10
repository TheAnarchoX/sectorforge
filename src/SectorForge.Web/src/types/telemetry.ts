export type TelemetrySourceStatus =
  | "Offline"
  | "Available"
  | "Running"
  | "NotImplemented";

export type TelemetryRunMode = "Idle" | "Live" | "Replay";

export type PitStatus = "Unknown" | "None" | "Pitting" | "InPitArea";

export type TyreCompound =
  | "Unknown"
  | "Soft"
  | "Medium"
  | "Hard"
  | "Intermediate"
  | "Wet";

export type ErsDeployMode =
  | "Unknown"
  | "None"
  | "Medium"
  | "Hotlap"
  | "Overtake";

export type WeatherKind =
  | "Unknown"
  | "Clear"
  | "LightCloud"
  | "Overcast"
  | "LightRain"
  | "HeavyRain"
  | "Storm";

export type SafetyCarStatus = "Unknown" | "None" | "Full" | "Virtual";

export type ResultStatus =
  | "Unknown"
  | "Active"
  | "Finished"
  | "Retired"
  | "Disqualified"
  | "NotClassified";

export type TelemetrySource = {
  adapterId: string;
  game: string;
  displayName: string;
  inputKind: string;
  isSimulated: boolean;
  status: TelemetrySourceStatus;
  notes?: string | null;
};

export type WheelTemperatureState = {
  surfaceC?: number | null;
  coreC?: number | null;
  innerC?: number | null;
  middleC?: number | null;
  outerC?: number | null;
};

export type WheelWearState = {
  wearPercent?: number | null;
};

export type WheelDamageState = {
  damagePercent?: number | null;
};

export type DamageState = {
  frontLeftWingPercent?: number | null;
  frontRightWingPercent?: number | null;
  rearWingPercent?: number | null;
  floorPercent?: number | null;
  diffuserPercent?: number | null;
  sidepodPercent?: number | null;
  gearboxPercent?: number | null;
  enginePercent?: number | null;
  frontLeftTyreDamage?: WheelDamageState | null;
  frontRightTyreDamage?: WheelDamageState | null;
  rearLeftTyreDamage?: WheelDamageState | null;
  rearRightTyreDamage?: WheelDamageState | null;
  frontLeftBrakeDamage?: WheelDamageState | null;
  frontRightBrakeDamage?: WheelDamageState | null;
  rearLeftBrakeDamage?: WheelDamageState | null;
  rearRightBrakeDamage?: WheelDamageState | null;
};

export type PowerUnitState = {
  ersStoreJoules?: number | null;
  ersDeployedThisLapJoules?: number | null;
  ersHarvestedThisLapMguk?: number | null;
  ersHarvestedThisLapMguh?: number | null;
  ersDeployMode?: ErsDeployMode | null;
};

export type WeatherForecastSample = {
  minutesAhead?: number | null;
  weather?: WeatherKind | null;
  rainPercent?: number | null;
  trackTemperatureC?: number | null;
  airTemperatureC?: number | null;
};

export type WeatherForecastState = {
  samples: WeatherForecastSample[];
};

export type TelemetrySample = {
  sessionId: string;
  sequence: number;
  timestamp: string;
  source: TelemetrySource;
  session: {
    id: string;
    name?: string | null;
    sessionType?: string | null;
    startedAt: string;
    isActive: boolean;
  };
  lap: {
    lapNumber?: number | null;
    currentLapTime?: string | null;
    lastLapTime?: string | null;
    bestLapTime?: string | null;
    sectorIndex?: number | null;
    lapDistanceMeters?: number | null;
    sector1Time?: string | null;
    sector2Time?: string | null;
    sector3Time?: string | null;
    lastSector1Time?: string | null;
    lastSector2Time?: string | null;
    lastSector3Time?: string | null;
    isValid?: boolean | null;
    totalDistanceMeters?: number | null;
    pitStatus?: PitStatus | null;
    pitStopCount?: number | null;
    penaltiesSeconds?: number | null;
    warningsCount?: number | null;
    cornersCut?: number | null;
  };
  vehicle: {
    carName?: string | null;
    speedKph?: number | null;
    rpm?: number | null;
    gear?: number | null;
    engineTemperatureC?: number | null;
    lateralG?: number | null;
    longitudinalG?: number | null;
    verticalG?: number | null;
    worldPositionX?: number | null;
    worldPositionY?: number | null;
    worldPositionZ?: number | null;
    yaw?: number | null;
    pitch?: number | null;
    roll?: number | null;
    oilTemperatureC?: number | null;
  };
  tyres: {
    frontLeft?: WheelTemperatureState | null;
    frontRight?: WheelTemperatureState | null;
    rearLeft?: WheelTemperatureState | null;
    rearRight?: WheelTemperatureState | null;
    frontLeftPressurePsi?: number | null;
    frontRightPressurePsi?: number | null;
    rearLeftPressurePsi?: number | null;
    rearRightPressurePsi?: number | null;
    compound?: TyreCompound | null;
    ageLaps?: number | null;
    frontLeftWear?: WheelWearState | null;
    frontRightWear?: WheelWearState | null;
    rearLeftWear?: WheelWearState | null;
    rearRightWear?: WheelWearState | null;
  };
  brakes: {
    frontLeftTemperatureC?: number | null;
    frontRightTemperatureC?: number | null;
    rearLeftTemperatureC?: number | null;
    rearRightTemperatureC?: number | null;
  };
  fuel: {
    remainingLiters?: number | null;
    capacityLiters?: number | null;
    litersPerLapEstimate?: number | null;
    lapsRemainingEstimate?: number | null;
  };
  track: {
    trackName?: string | null;
    trackTemperatureC?: number | null;
    airTemperatureC?: number | null;
    weather?: string | null;
    trackId?: string | null;
    trackLengthMeters?: number | null;
    rainPercent?: number | null;
    weatherEnum?: WeatherKind | null;
    safetyCarStatus?: SafetyCarStatus | null;
    formationLap?: boolean | null;
  };
  driverInput: {
    throttle?: number | null;
    brake?: number | null;
    steering?: number | null;
    clutch?: number | null;
    drsAllowed?: boolean | null;
    drsActive?: boolean | null;
    pitLimiterActive?: boolean | null;
    absActive?: boolean | null;
    tcActive?: boolean | null;
  };
  timing: {
    sessionElapsed?: string | null;
    sessionRemaining?: string | null;
    deltaToBestLap?: string | null;
    sectorDelta?: string | null;
    sessionTimeLeft?: string | null;
    sessionDuration?: string | null;
  };
  participants?: ParticipantState[] | null;
  damage?: DamageState | null;
  powerUnit?: PowerUnitState | null;
  weatherForecast?: WeatherForecastState | null;
};

export type ParticipantState = {
  driverName: string;
  teamName?: string | null;
  carName?: string | null;
  position: number;
  isPlayer: boolean;
  isInPit: boolean;
  lapNumber?: number | null;
  currentLapTime?: string | null;
  lastLapTime?: string | null;
  bestLapTime?: string | null;
  gapToLeader?: string | null;
  intervalToAhead?: string | null;
  sector1?: string | null;
  sector2?: string | null;
  bestSector1?: string | null;
  bestSector2?: string | null;
  bestSector3?: string | null;
  tyreCompound?: TyreCompound | null;
  pitStopCount?: number | null;
  resultStatus?: ResultStatus | null;
  gridPosition?: number | null;
  driverNumber?: number | null;
  isAi?: boolean | null;
};

export type CollectorStatus = {
  isRunning: boolean;
  runMode: TelemetryRunMode;
  activeAdapterId?: string | null;
  source?: TelemetrySource | null;
  startedAt?: string | null;
  lastSampleAt?: string | null;
  samplesPublished: number;
  lastError?: string | null;
  latestSample?: TelemetrySample | null;
};

export type TelemetrySessionSummary = {
  id: string;
  game: string;
  sourceName?: string | null;
  trackName?: string | null;
  carName?: string | null;
  startedAt: string;
  lastSeenAt: string;
  bestLapTime?: string | null;
  sampleCount: number;
};

export type LapSummary = {
  sessionId: string;
  lapNumber: number;
  lapTime?: string | null;
  bestLapTime?: string | null;
  updatedAt: string;
};

export type LapCompareChannelKey =
  | "speedKph"
  | "rpm"
  | "throttle"
  | "brake"
  | "steering"
  | "lateralG"
  | "longitudinalG"
  | "drsActive"
  | "ersStoreJoules";

export const DEFAULT_COMPARE_PANEL_ID = "overlay-primary";
export const DEFAULT_COMPARE_PANEL_CHANNEL: LapCompareChannelKey = "speedKph";

export type LapBasketPanelChannelSelection = {
  panelId: string;
  channelKey: LapCompareChannelKey;
};

export type LapBasketSessionContext = {
  game?: string | null;
  sourceName?: string | null;
  trackName?: string | null;
  carName?: string | null;
  startedAt?: string | null;
  lastSeenAt?: string | null;
  weather?: string | null;
  trackTemperatureC?: number | null;
  airTemperatureC?: number | null;
};

export type LapBasketEntry = {
  sessionId: string;
  lapNumber: number;
  label: string;
  color: string;
  channelSelections?: LapBasketPanelChannelSelection[];
  session?: LapBasketSessionContext;
};

export type ReferenceLapSelection = Pick<
  LapBasketEntry,
  "sessionId" | "lapNumber" | "label" | "session"
>;

export type LapChannelValueKind = "Number" | "Boolean";

export type LapChannelManifestEntry = {
  key: string;
  label: string;
  valueKind: LapChannelValueKind;
  unit?: string | null;
};

export type LapChannelData = {
  time: Array<number | null>;
  speedKph: Array<number | null>;
  rpm: Array<number | null>;
  throttle: Array<number | null>;
  brake: Array<number | null>;
  steering: Array<number | null>;
  lapDistance?: Array<number | null> | null;
  lateralG?: Array<number | null> | null;
  longitudinalG?: Array<number | null> | null;
  drsActive?: Array<boolean | null> | null;
  ersStoreJoules?: Array<number | null> | null;
};

export type LapChannelsResponse = {
  sessionId: string;
  lapNumber: number;
  lapTime?: string | null;
  bestLapTime?: string | null;
  sector1Time?: string | null;
  sector2Time?: string | null;
  sector3Time?: string | null;
  sampleCount: number;
  manifest: LapChannelManifestEntry[];
  channels: LapChannelData;
};

export type TelemetrySessionDetails = {
  session: TelemetrySessionSummary;
  laps: LapSummary[];
  samples: TelemetrySample[];
};

export type TelemetryTraceSeries = {
  speed: number[];
  rpm: number[];
  throttle: number[];
  brake: number[];
  steering: number[];
};

export type LapTelemetryPoint = {
  elapsedSeconds: number;
  value: number;
  lapDistanceMeters?: number | null;
};

export type CurrentLapTelemetrySeries = {
  sessionId: string | null;
  lapNumber: number | null;
  points: LapTelemetryPoint[];
};

export type DashboardReplayState = {
  sessionId: string;
  sessionName?: string | null;
  sampleIndex: number;
  sampleCount: number;
  isPlaying: boolean;
  sample: TelemetrySample;
  traceSeries: TelemetryTraceSeries;
  lapTrace: CurrentLapTelemetrySeries;
};

export type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";
