// Raças mais conhecidas por espécie, para a lista de cadastro de pet. Não é uma lista oficial/exaustiva de
// nenhuma confederação (CBKC, CFA, TICA...) — é um apanhado das raças mais comuns, o suficiente para o dia a
// dia de um petshop. Quando a raça não está na lista, a pessoa escolhe "Outra (digite)" e digita à mão.
export const BREEDS_BY_SPECIES: Record<string, string[]> = {
  'Cão': [
    'Affenpinscher', 'Akita', 'Alaskan Malamute', 'American Bully', 'American Pit Bull Terrier',
    'American Staffordshire Terrier', 'Basenji', 'Basset Hound', 'Beagle', 'Bearded Collie',
    'Bichon Frisé', 'Bloodhound', 'Boiadeiro Australiano', 'Border Collie', 'Border Terrier',
    'Borzoi', 'Boston Terrier', 'Boxer', 'Buldogue Americano', 'Buldogue Francês', 'Buldogue Inglês',
    'Bull Terrier', 'Cairn Terrier', 'Cane Corso', 'Cavalier King Charles Spaniel', 'Chihuahua',
    'Chow Chow', 'Cocker Spaniel Americano', 'Cocker Spaniel Inglês', 'Collie', 'Corgi Cardigan',
    'Corgi Galês de Pembroke', 'Dachshund (Teckel)', 'Dálmata', 'Doberman', 'Dogo Argentino',
    'Dogo Canário', 'Dogue Alemão', 'Dogue de Bordeaux', 'Fila Brasileiro', 'Fox Paulistinha',
    'Fox Terrier', 'Galgo', 'Golden Retriever', 'Greyhound', 'Havanese', 'Husky Siberiano',
    'Jack Russell Terrier', 'Keeshond', 'Kelpie Australiano', 'Komondor', 'Labrador Retriever',
    'Lhasa Apso', 'Lulu da Pomerânia', 'Maltês', 'Mastim Napolitano', 'Mastim Tibetano',
    'Mastiff Inglês', 'Mini Pinscher', 'Newfoundland (Terra Nova)', 'Old English Sheepdog (Bobtail)',
    'Papillon', 'Pastor Alemão', 'Pastor Australiano', 'Pastor Belga Groenendael',
    'Pastor Belga Malinois', 'Pastor Belga Tervueren', 'Pastor de Shetland', 'Pequinês', 'Pinscher',
    'Pit Bull', 'Pointer', 'Pointer Alemão de Pelo Curto', 'Poodle Miniatura', 'Poodle Standard',
    'Poodle Toy', 'Pug', 'Puli', 'Rhodesian Ridgeback', 'Rottweiler', 'Saluki', 'Samoieda',
    'Schipperke', 'Schnauzer Gigante', 'Schnauzer Miniatura', 'Schnauzer Standard', 'Scottish Terrier',
    'Setter Inglês', 'Setter Irlandês', 'Shar Pei', 'Shiba Inu', 'Shih Tzu', 'Spaniel Bretão',
    'Spitz Alemão', 'Spitz Japonês', 'Springer Spaniel Inglês', 'São Bernardo',
    'Staffordshire Bull Terrier', 'Terrier Brasileiro', 'Vira-lata / SRD', 'Vizsla', 'Weimaraner',
    'Welsh Terrier', 'West Highland White Terrier', 'Whippet', 'Xoloitzcuintle', 'Yorkshire Terrier',
  ],
  'Gato': [
    'Abissínio', 'American Curl', 'American Shorthair', 'Angorá Turco', 'Azul Russo', 'Balinês',
    'Bengal', 'Birmanês (Sagrado da Birmânia)', 'Bombaim', 'British Longhair', 'British Shorthair',
    'Burmês', 'Chartreux', 'Cornish Rex', 'Devon Rex', 'Egyptian Mau', 'Exótico de Pelo Curto',
    'Himalaio', 'Korat', 'LaPerm', 'Maine Coon', 'Manx', 'Munchkin', 'Norueguês da Floresta',
    'Ocicat', 'Oriental', 'Persa', 'Peterbald', 'Pixie-bob', 'Ragdoll', 'Savannah', 'Scottish Fold',
    'Selkirk Rex', 'Siamês', 'Siberiano', 'Singapura', 'Somali', 'Sphynx', 'Tonquinês',
    'Turkish Van', 'Vira-lata / SRD',
  ],
  'Ave': [
    'Agapornis', 'Arara-azul', 'Arara-canindé', 'Arara-vermelha', 'Cacatua', 'Calopsita',
    'Canário-belga', 'Canário-da-terra', 'Codorna', 'Diamante-de-gould', 'Diamante-mandarim',
    'Jandaia', 'Lóris', 'Mandarim', 'Papagaio-verdadeiro', 'Periquito-australiano',
    'Periquito-inglês', 'Pombo', 'Ring-neck', 'Rosela',
  ],
  'Roedor': [
    'Camundongo (Fancy Mouse)', 'Chinchila', 'Degu', 'Esquilo-da-mongólia (Gerbil)',
    'Hamster Anão Russo', 'Hamster Chinês', 'Hamster Sírio', 'Porquinho-da-índia', 'Rato (Twister)',
  ],
};

export const BREED_CUSTOM_VALUE = '__custom__';
