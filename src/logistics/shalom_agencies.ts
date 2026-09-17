import { ShalomAgency } from './shalom_types.js';

export const SHALOM_POPULAR_AGENCIES: ShalomAgency[] = [
  // LIMA METROPOLITANA Y GAMARRA
  { id: 404, name: 'LIMA - GAMARRA (JR. ANTONIO BAZO)', department: 'LIMA', province: 'LIMA', district: 'LA VICTORIA', address: 'Jr. Antonio Bazo 1160, La Victoria', hasAirService: true },
  { id: 405, name: 'LIMA - GRAU (CENTRO)', department: 'LIMA', province: 'LIMA', district: 'LIMA', address: 'Av. Miguel Grau 620, Cercado de Lima', hasAirService: true },
  { id: 406, name: 'LIMA - SAN ISIDRO', department: 'LIMA', province: 'LIMA', district: 'SAN ISIDRO', address: 'Av. República de Panamá 3545', hasAirService: true },
  { id: 407, name: 'LIMA - MIRAFLORES', department: 'LIMA', province: 'LIMA', district: 'MIRAFLORES', address: 'Av. Benavides 1944', hasAirService: true },
  { id: 408, name: 'LIMA - LOS OLIVOS', department: 'LIMA', province: 'LIMA', district: 'LOS OLIVOS', address: 'Av. Alfredo Mendiola 3650 (Pan. Norte)', hasAirService: true },
  { id: 409, name: 'LIMA - SAN JUAN DE LURIGANCHO (PRÓCERES)', department: 'LIMA', province: 'LIMA', district: 'SAN JUAN DE LURIGANCHO', address: 'Av. Próceres de la Independencia 1820', hasAirService: true },
  { id: 410, name: 'LIMA - SAN JUAN DE MIRAFLORES', department: 'LIMA', province: 'LIMA', district: 'SAN JUAN DE MIRAFLORES', address: 'Av. Los Héroes 450', hasAirService: true },
  { id: 411, name: 'LIMA - ATE VITARTE', department: 'LIMA', province: 'LIMA', district: 'ATE', address: 'Av. Nicolás Ayllón 5420 (Carretera Central)', hasAirService: true },
  { id: 412, name: 'CALLAO - AEROPUERTO / FAUCETT', department: 'CALLAO', province: 'CALLAO', district: 'CALLAO', address: 'Av. Elmer Faucett 1980', hasAirService: true },

  // PRINCIPALES CIUDADES DE PROVINCIAS
  { id: 7, name: 'AREQUIPA - TERMINAL TERRESTRE', department: 'AREQUIPA', province: 'AREQUIPA', district: 'JOSE LUIS BUSTAMANTE Y RIVERO', address: 'Av. Los Incas s/n, frente a Terminal Terrestre', hasAirService: true },
  { id: 8, name: 'AREQUIPA - CENTRO', department: 'AREQUIPA', province: 'AREQUIPA', district: 'AREQUIPA', address: 'Calle San Juan de Dios 512', hasAirService: true },
  { id: 15, name: 'TRUJILLO - AV. ESPAÑA', department: 'LA LIBERTAD', province: 'TRUJILLO', district: 'TRUJILLO', address: 'Av. España 1042', hasAirService: true },
  { id: 16, name: 'TRUJILLO - EL PORVENIR (CALZADO)', department: 'LA LIBERTAD', province: 'TRUJILLO', district: 'EL PORVENIR', address: 'Av. Pumacahua 1250', hasAirService: true },
  { id: 22, name: 'CHICLAYO - CENTRO', department: 'LAMBAYEQUE', province: 'CHICLAYO', district: 'CHICLAYO', address: 'Av. Bolognesi 450', hasAirService: true },
  { id: 28, name: 'PIURA - CENTRO', department: 'PIURA', province: 'PIURA', district: 'PIURA', address: 'Av. Sánchez Cerro 1120', hasAirService: true },
  { id: 29, name: 'SULLANA - CENTRO', department: 'PIURA', province: 'SULLANA', district: 'SULLANA', address: 'Transversal Tarapacá 415', hasAirService: true },
  { id: 35, name: 'CUSCO - TERMINAL TERRESTRE', department: 'CUSCO', province: 'CUSCO', district: 'SANTIAGO', address: 'Vía de Evitamiento 410', hasAirService: true },
  { id: 36, name: 'CUSCO - WANCHAQ', department: 'CUSCO', province: 'CUSCO', district: 'WANCHAQ', address: 'Av. Huayruropata 1205', hasAirService: true },
  { id: 42, name: 'HUANCAYO - CENTRO', department: 'JUNIN', province: 'HUANCAYO', district: 'HUANCAYO', address: 'Av. Ferrocarril 850', hasAirService: true },
  { id: 43, name: 'HUANCAYO - EL TAMBO', department: 'JUNIN', province: 'HUANCAYO', district: 'EL TAMBO', address: 'Av. Mariscal Castilla 1420', hasAirService: true },
  { id: 50, name: 'ICA - CENTRO', department: 'ICA', province: 'ICA', district: 'ICA', address: 'Av. Matías Manzanilla 140', hasAirService: true },
  { id: 51, name: 'CHINCHA - CENTRO', department: 'ICA', province: 'CHINCHA', district: 'CHINCHA ALTA', address: 'Av. Mariscal Benavides 620', hasAirService: true },
  { id: 60, name: 'TACNA - CENTRO', department: 'TACNA', province: 'TACNA', district: 'TACNA', address: 'Av. Leguía 1450', hasAirService: true },
  { id: 65, name: 'JULIACA - TERMINAL', department: 'PUNO', province: 'SAN ROMAN', district: 'JULIACA', address: 'Av. Circunvalación 820', hasAirService: true },
  { id: 66, name: 'PUNO - CENTRO', department: 'PUNO', province: 'PUNO', district: 'PUNO', address: 'Jr. Los Incas 230', hasAirService: true },
  { id: 70, name: 'TARAPOTO - CENTRO', department: 'SAN MARTIN', province: 'SAN MARTIN', district: 'TARAPOTO', address: 'Jr. Jiménez Pimentel 740', hasAirService: true },
  { id: 75, name: 'PUCALLPA - CENTRO', department: 'UCAYALI', province: 'CORONEL PORTILLO', district: 'CALLERIA', address: 'Av. Centenario Km 2.5', hasAirService: true },
  { id: 80, name: 'IQUITOS - CENTRO', department: 'LORETO', province: 'MAYNAS', district: 'IQUITOS', address: 'Jr. Próspero 850', hasAirService: true },
  { id: 85, name: 'CAJAMARCA - CENTRO', department: 'CAJAMARCA', province: 'CAJAMARCA', district: 'CAJAMARCA', address: 'Av. Atahualpa 420', hasAirService: true },
  { id: 90, name: 'CHIMBOTE - CENTRO', department: 'ANCASH', province: 'SANTA', district: 'CHIMBOTE', address: 'Av. José Gálvez 720', hasAirService: true },
  { id: 91, name: 'HUARAZ - CENTRO', department: 'ANCASH', province: 'HUARAZ', district: 'HUARAZ', address: 'Av. Luzuriaga 910', hasAirService: true },
  { id: 95, name: 'AYACUCHO - CENTRO', department: 'AYACUCHO', province: 'HUAMANGA', district: 'AYACUCHO', address: 'Jr. 28 de Julio 450', hasAirService: true },
  { id: 100, name: 'HUANUCO - CENTRO', department: 'HUANUCO', province: 'HUANUCO', district: 'HUANUCO', address: 'Jr. General Prado 640', hasAirService: true }
];

export class ShalomAgenciesCatalog {
  /**
   * Busca agencias por texto (nombre, ciudad, provincia o departamento)
   */
  public static search(query: string): ShalomAgency[] {
    const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!q) return SHALOM_POPULAR_AGENCIES.slice(0, 10);

    return SHALOM_POPULAR_AGENCIES.filter(a => {
      const full = `${a.name} ${a.department} ${a.province} ${a.district} ${a.address}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return full.includes(q);
    });
  }

  /**
   * Obtiene una agencia por ID
   */
  public static getById(id: number): ShalomAgency | undefined {
    return SHALOM_POPULAR_AGENCIES.find(a => a.id === id);
  }

  /**
   * Encuentra la mejor agencia de origen sugerida según texto libre
   */
  public static findBestMatch(text: string): ShalomAgency {
    const results = this.search(text);
    if (results.length > 0) return results[0];
    // Default Gamarra si no se encuentra
    return SHALOM_POPULAR_AGENCIES[0];
  }
}
