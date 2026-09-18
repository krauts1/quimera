const mascot = (id, name, animations, equipment) => ({
  id,
  name,
  family: 'mascot',
  familyLabel: 'Axie mascots',
  path: `mascots/${id}.glb`,
  animations,
  equipment,
  minimumBones: 1,
});

const sapidae = (id, name) => ({
  id,
  name,
  family: 'sapidae',
  familyLabel: 'Sapidae',
  path: `sapidae/${id}.glb`,
  animations: ['Idle', 'Walk', 'Run'],
  minimumBones: 14,
});

const equipment = (id, name) => ({
  id,
  name,
  family: 'equipment',
  familyLabel: 'Optional equipment',
  path: `equipment/${id}.glb`,
  animations: [],
  minimumBones: 0,
});

export const assetDefinitions = [
  mascot('bing', 'Bing', ['Idle', 'Walk', 'Run', 'Greeting', 'Dead', 'Cannon.Idle', 'Cannon.Walk', 'Cannon.Run', 'Cannon.Attack', 'Cannon.Skill'], 'bing-cannon'),
  mascot('kibo', 'Kibo', ['Idle', 'Walk', 'Run', 'Greeting', 'Dead', 'Hammer.Idle', 'Hammer.Walk', 'Hammer.Run', 'Hammer.Attack', 'Hammer.Skill'], 'kibo-hammer'),
  mascot('kotaro', 'Kotaro', ['Idle', 'Walk', 'Run', 'Greeting', 'Dead', 'Sword.Idle', 'Sword.Walk', 'Sword.Run', 'Sword.Attack', 'Sword.Skill'], 'kotaro-sword'),
  mascot('paladill', 'Paladill', ['Idle', 'Walk', 'Run', 'Greeting', 'Dead', 'Hammer.Idle', 'Hammer.Walk', 'Hammer.Run', 'Hammer.Attack', 'Hammer.Skill'], 'paladill-axe'),
  mascot('pomodoro', 'Pomodoro', ['Idle', 'Walk', 'Run', 'Dead', 'Staff.Idle', 'Staff.Walk', 'Staff.Run', 'Staff.Attack', 'Staff.Skill'], 'pomodoro-staff'),
  mascot('tripp', 'Tripp', ['Idle', 'Walk', 'Run', 'Axe.Attack', 'Axe.Skill'], 'tripp-sword'),
  mascot('xia', 'Xia', ['Idle', 'Walk', 'Run', 'Greeting', 'Dead', 'Axe.Idle', 'Axe.Walk', 'Axe.Run', 'Axe.Attack', 'Axe.Skill'], 'xia-axe'),
  sapidae('sapidae-f-a', 'Sapidae F-A'),
  sapidae('sapidae-f-b', 'Sapidae F-B'),
  sapidae('sapidae-f-c', 'Sapidae F-C'),
  sapidae('sapidae-f-d', 'Sapidae F-D'),
  sapidae('sapidae-f-e', 'Sapidae F-E'),
  sapidae('sapidae-m-a', 'Sapidae M-A'),
  sapidae('sapidae-m-b', 'Sapidae M-B'),
  sapidae('sapidae-m-c', 'Sapidae M-C'),
  sapidae('sapidae-m-d', 'Sapidae M-D'),
  sapidae('sapidae-m-e', 'Sapidae M-E'),
  equipment('bing-cannon', "Bing's cannon"),
  equipment('kibo-hammer', "Kibo's hammer"),
  equipment('kotaro-sword', "Kotaro's sword"),
  equipment('paladill-axe', "Paladill's axe"),
  equipment('pomodoro-staff', "Pomodoro's staff"),
  equipment('tripp-sword', "Tripp's sword"),
  equipment('xia-axe', "Xia's axe"),
];
