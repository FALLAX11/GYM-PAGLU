import type {
  ExerciseCategory,
  ExerciseDifficulty,
  ExerciseItem,
  ExerciseMovementType,
} from '../types/database';

type RawTuple = [
  name: string,
  primaryCategory: ExerciseCategory,
  categories?: ExerciseCategory[],
  equipment?: string,
  exerciseType?: ExerciseMovementType,
  difficulty?: ExerciseDifficulty,
  secondaryMuscles?: string[],
  targetMuscle?: string,
  aliases?: string[],
  instructions?: string,
  commonMistakes?: string,
];

function inferEquipment(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('smith machine')) return 'Smith Machine';
  if (n.includes('ez bar')) return 'EZ Bar';
  if (n.includes('kettlebell')) return 'Kettlebell';
  if (n.includes('trap bar')) return 'Trap Bar';
  if (n.includes('landmine') || n.includes('meadows row')) return 'Landmine';
  if (n.includes('cable') || n.includes('pulldown') || n.includes('pushdown') || n.includes('face pull') || n.includes('bayesian') || n.includes('pallof')) return 'Cable';
  if (
    n.includes('machine') ||
    n.includes('pec deck') ||
    n.includes('leg press') ||
    n.includes('hack squat') ||
    n.includes('leg extension') ||
    n.includes('leg curl') ||
    n.includes('iso-lateral') ||
    n.includes('chest supported row') ||
    n.includes('t-bar') ||
    n.includes('donkey calf') ||
    n.includes('standing calf raise') ||
    n.includes('seated calf raise')
  ) {
    return 'Machine';
  }
  if (
    n.includes('treadmill') ||
    n.includes('cycling') ||
    n.includes('elliptical') ||
    n.includes('stair climber') ||
    n.includes('rowing machine')
  ) {
    return 'Cardio Machine';
  }
  if (n.includes('dumbbell') || n.includes('arnold press') || n.includes('zottman') || n.includes('hammer curl') || n.includes('cross body hammer') || n.includes('concentration curl') || n.includes('hex press') || n.includes('goblet') || n.includes('farmer')) {
    return 'Dumbbell';
  }
  if (n.includes('barbell') || n.includes('deadlift') || n.includes('pendlay') || n.includes('rack pull') || n.includes('good morning') || n.includes('front squat') || n.includes('zercher') || n.includes('box squat') || n.includes('heel elevated squat') || n.includes('back squat') || n.includes('z press') || n.includes('drag curl') || n.includes('cheat curl') || n.includes('21s') || n.includes('skull crusher') || n.includes('close grip bench') || n.includes('reverse grip bench') || n.includes('jm press') || n.includes('clean') || n.includes('snatch') || n.includes('thrusters') || n.includes('bear complex') || n.includes('upright row')) {
    return 'Barbell';
  }
  if (n.includes('band') || n.includes('monster walks') || n.includes('clamshells')) return 'Band';
  if (n.includes('plate') || n.includes('svend')) return 'Plate';
  if (
    n.includes('ab wheel') ||
    n.includes('stability ball') ||
    n.includes('gripper') ||
    n.includes('captains of crush') ||
    n.includes('wrist roller') ||
    n.includes('towel') ||
    n.includes('neck harness') ||
    n.includes('jump rope') ||
    n.includes('battle ropes')
  ) {
    return 'Other';
  }
  return 'Bodyweight';
}

function inferType(name: string, cat: ExerciseCategory): ExerciseMovementType {
  if (cat === 'Cardio') return 'Cardio';
  if (cat === 'Mobility') return 'Mobility';
  const n = name.toLowerCase();
  if (
    n.includes('curl') ||
    n.includes('fly') ||
    n.includes('raise') ||
    n.includes('extension') ||
    n.includes('pushdown') ||
    n.includes('kickback') ||
    n.includes('shrug') ||
    n.includes('calf') ||
    n.includes('pullover') ||
    n.includes('crunch') ||
    n.includes('abduction') ||
    n.includes('adduction') ||
    n.includes('pull apart') ||
    n.includes('neck') ||
    n.includes('pronation') ||
    n.includes('deviation') ||
    n.includes('gripper') ||
    n.includes('pinch') ||
    n.includes('face pull') ||
    n.includes('frog pumps') ||
    n.includes('clamshells') ||
    n.includes('fire hydrants') ||
    n.includes('tate press') ||
    n.includes('svend')
  ) {
    return 'Isolation';
  }
  return 'Compound';
}

function inferDifficulty(name: string, cat: ExerciseCategory): ExerciseDifficulty {
  const n = name.toLowerCase();
  if (
    n.includes('muscle-up') ||
    n.includes('planche') ||
    n.includes('human flag') ||
    n.includes('front lever') ||
    n.includes('back lever') ||
    n.includes('handstand') ||
    n.includes('pistol squat') ||
    n.includes('shrimp squat') ||
    n.includes('dragon flag') ||
    n.includes('nordic') ||
    n.includes('snatch') ||
    n.includes('clean and jerk') ||
    n.includes('bear complex') ||
    n.includes('turkish get-up') ||
    n.includes('sissy squat') ||
    n.includes('zercher') ||
    n.includes('neck harness')
  ) {
    return 'Advanced';
  }
  if (
    cat === 'Mobility' ||
    n.includes('machine') ||
    n.includes('pec deck') ||
    n.includes('pushdown') ||
    n.includes('crunch') ||
    n.includes('plank') ||
    n.includes('bird dog') ||
    n.includes('superman') ||
    n.includes('dead bug') ||
    n.includes('glute bridge') ||
    n.includes('walking') ||
    n.includes('elliptical') ||
    n.includes('stationary cycling') ||
    n.includes('goblet squat') ||
    n.includes('leg extension') ||
    n.includes('leg curl') ||
    n.includes('band pull apart')
  ) {
    return 'Beginner';
  }
  return 'Intermediate';
}

function defaultSecondary(cat: ExerciseCategory): string[] {
  switch (cat) {
    case 'Back':
      return ['Biceps', 'Forearms', 'Rear Delts'];
    case 'Biceps':
      return ['Forearms', 'Brachialis'];
    case 'Chest':
      return ['Front Delts', 'Triceps'];
    case 'Triceps':
      return ['Front Delts'];
    case 'Legs':
      return ['Glutes', 'Core'];
    case 'Shoulders':
      return ['Triceps', 'Traps'];
    case 'Abs':
      return ['Hip Flexors', 'Lower Back'];
    case 'Forearms':
      return ['Biceps'];
    case 'Traps':
      return ['Shoulders', 'Forearms'];
    case 'Neck':
      return ['Upper Traps'];
    case 'Cardio':
      return ['Legs', 'Core'];
    case 'Glutes':
      return ['Hamstrings', 'Core'];
    case 'Full Body':
      return ['Legs', 'Back', 'Shoulders', 'Core'];
    case 'Calisthenics':
      return ['Core', 'Arms'];
    case 'Mobility':
      return ['Joint Stability'];
    default:
      return ['Core'];
  }
}

function defaultTargetMuscle(name: string, cat: ExerciseCategory): string {
  const n = name.toLowerCase();
  if (n.includes('pulldown') || n.includes('pull-up') || n.includes('chin-up') || n.includes('pullover')) {
    return 'Latissimus Dorsi';
  }
  if (n.includes('row')) return 'Rhomboids, Middle Traps & Lats';
  if (n.includes('deadlift') || n.includes('good morning') || n.includes('rack pull')) {
    return 'Posterior Chain (Hamstrings, Glutes & Erectors)';
  }
  if (n.includes('incline')) return 'Upper Pectoralis Major / Anterior Delts';
  if (n.includes('decline')) return 'Lower Pectoralis Major';
  if (cat === 'Chest') return 'Pectoralis Major';
  if (cat === 'Biceps') return 'Biceps Brachii & Brachialis';
  if (cat === 'Triceps') return 'Triceps Brachii';
  if (n.includes('squat') || n.includes('leg press') || n.includes('lunge') || n.includes('leg extension')) {
    return 'Quadriceps & Glutes';
  }
  if (n.includes('leg curl') || n.includes('nordic') || n.includes('glute ham')) return 'Hamstrings';
  if (n.includes('calf') || n.includes('toe raise') || n.includes('tibialis')) return 'Gastrocnemius, Soleus & Tibialis';
  if (n.includes('lateral raise')) return 'Lateral Deltoid';
  if (n.includes('rear delt') || n.includes('reverse fly') || n.includes('reverse pec') || n.includes('face pull') || n.includes('band pull')) {
    return 'Posterior Deltoid';
  }
  if (cat === 'Shoulders') return 'Anterior & Lateral Deltoids';
  if (n.includes('side') || n.includes('oblique') || n.includes('woodchopper') || n.includes('russian twist') || n.includes('rotation')) {
    return 'External & Internal Obliques';
  }
  if (cat === 'Abs') return 'Rectus Abdominis & Transverse Abdominis';
  if (cat === 'Forearms') return 'Forearm Flexors, Extensors & Brachioradialis';
  if (cat === 'Traps') return 'Upper & Middle Trapezius';
  if (cat === 'Neck') return 'Sternocleidomastoid & Cervical Extensors';
  if (cat === 'Glutes') return 'Gluteus Maximus & Gluteus Medius';
  if (cat === 'Cardio') return 'Cardiorespiratory System';
  if (cat === 'Full Body') return 'Full-Body Musculature';
  if (cat === 'Calisthenics') return 'Multi-Joint Bodyweight Strength';
  if (cat === 'Mobility') return 'Target Muscle & Joint Capsule';
  return cat;
}

function defaultInstructions(name: string, type: ExerciseMovementType): string {
  if (type === 'Mobility') {
    return `Move slowly into the ${name} position without bouncing, breathe steadily through the nose, and pause at a mild-to-moderate stretch.`;
  }
  if (type === 'Cardio') {
    return `Maintain upright posture and a sustainable breathing cadence during ${name}, adjusting pace or resistance to hit your target heart-rate zone.`;
  }
  if (type === 'Isolation') {
    return `Stabilize surrounding joints, move through a smooth full range of motion during ${name}, pause briefly at peak contraction, and control the eccentric.`;
  }
  return `Brace your core and set your posture before initiating ${name}; drive steadily through the working muscles with controlled lowering on every rep.`;
}

function defaultMistakes(name: string, type: ExerciseMovementType): string {
  if (type === 'Mobility') {
    return `Avoid forcing painful joint end-ranges, holding your breath, or rushing repetitions during ${name}.`;
  }
  if (type === 'Cardio') {
    return `Avoid slouching, gripping supports too tightly, or starting faster than you can sustain cleanly.`;
  }
  if (type === 'Isolation') {
    return `Avoid using torso momentum, cutting range of motion short, or dropping the weight uncontrolled.`;
  }
  return `Avoid losing core brace, rounding the lower back, or bouncing out of the bottom position.`;
}

/**
 * Complete canonical Master Exercise Library covering every exercise from all 15 categories
 * of Gym_Paglu_Exercise_Master_Library_d57ddaa7.pdf with multi-category filtering and zero duplicates.
 */
const MASTER_TUPLES: RawTuple[] = [
  // ================= 1. BACK =================
  ['Pull-Ups', 'Back', ['Back', 'Calisthenics'], 'Bodyweight', 'Compound', 'Intermediate', ['Biceps', 'Forearms', 'Abs'], 'Latissimus Dorsi', ['Pullups', 'Pull Ups']],
  ['Chin-Ups', 'Back', ['Back', 'Calisthenics', 'Biceps'], 'Bodyweight', 'Compound', 'Intermediate', ['Biceps', 'Forearms'], 'Latissimus Dorsi & Biceps', ['Chinups', 'Chin Ups']],
  ['Wide Grip Pull-Ups', 'Back', ['Back', 'Calisthenics'], 'Bodyweight', 'Compound', 'Intermediate', ['Biceps', 'Teres Major'], 'Upper Lats'],
  ['Close Grip Pull-Ups', 'Back', ['Back', 'Calisthenics'], 'Bodyweight', 'Compound', 'Intermediate', ['Biceps', 'Forearms'], 'Lower Lats'],
  ['Neutral Grip Pull-Ups', 'Back', ['Back', 'Calisthenics'], 'Bodyweight', 'Compound', 'Intermediate', ['Biceps', 'Brachioradialis'], 'Latissimus Dorsi'],
  ['Lat Pulldown', 'Back', ['Back'], 'Cable', 'Compound', 'Beginner', ['Biceps', 'Rear Delts'], 'Latissimus Dorsi', ['Lat Pull Down', 'Cable Lat Pulldown', 'Pulldown']],
  ['Wide Grip Lat Pulldown', 'Back', ['Back'], 'Cable', 'Compound', 'Beginner', ['Biceps', 'Teres Major'], 'Outer & Upper Lats', ['Wide-Grip Lat Pulldown']],
  ['Close Grip Lat Pulldown', 'Back', ['Back'], 'Cable', 'Compound', 'Beginner', ['Biceps', 'Rhomboids'], 'Middle & Lower Lats', ['Close-Grip Lat Pulldown', 'V-Bar Lat Pulldown']],
  ['Reverse Grip Lat Pulldown', 'Back', ['Back'], 'Cable', 'Compound', 'Beginner', ['Biceps'], 'Lower Lats', ['Reverse-Grip Lat Pulldown', 'Underhand Lat Pulldown']],
  ['Neutral Grip Lat Pulldown', 'Back', ['Back'], 'Cable', 'Compound', 'Beginner', ['Biceps', 'Brachialis'], 'Latissimus Dorsi'],
  ['Single Arm Lat Pulldown', 'Back', ['Back'], 'Cable', 'Compound', 'Intermediate', ['Biceps', 'Core'], 'Unilateral Lats', ['Single-Arm Lat Pulldown']],
  ['Straight Arm Pulldown', 'Back', ['Back'], 'Cable', 'Isolation', 'Beginner', ['Triceps Long Head', 'Core'], 'Latissimus Dorsi', ['Straight-Arm Lat Pulldown', 'Cable Pullover']],
  ['Kneeling Cable Pulldown', 'Back', ['Back'], 'Cable', 'Compound', 'Intermediate', ['Biceps', 'Core'], 'Latissimus Dorsi'],
  ['Dumbbell Pullover', 'Back', ['Back', 'Chest'], 'Dumbbell', 'Isolation', 'Intermediate', ['Chest', 'Serratus Anterior'], 'Lats & Pectorals'],
  ['Machine Pullover', 'Back', ['Back'], 'Machine', 'Isolation', 'Beginner', ['Chest', 'Triceps Long Head'], 'Latissimus Dorsi'],
  ['Barbell Bent Over Row', 'Back', ['Back'], 'Barbell', 'Compound', 'Intermediate', ['Biceps', 'Rear Delts', 'Lower Back'], 'Middle Back & Lats', ['Barbell Row', 'Bent Over Row', 'Barbell Bent-Over Row']],
  ['Pendlay Row', 'Back', ['Back'], 'Barbell', 'Compound', 'Advanced', ['Biceps', 'Glutes', 'Lower Back'], 'Upper Back & Lats'],
  ['T-Bar Row', 'Back', ['Back'], 'Machine', 'Compound', 'Intermediate', ['Biceps', 'Rear Delts'], 'Middle Back & Lats'],
  ['Chest Supported Row', 'Back', ['Back'], 'Machine', 'Compound', 'Beginner', ['Biceps', 'Rear Delts'], 'Rhomboids & Middle Traps', ['Chest-Supported Row']],
  ['Seated Cable Row', 'Back', ['Back'], 'Cable', 'Compound', 'Beginner', ['Biceps', 'Rear Delts'], 'Middle Back & Lats'],
  ['Close Grip Cable Row', 'Back', ['Back'], 'Cable', 'Compound', 'Beginner', ['Biceps', 'Lats'], 'Lower Lats & Mid-Back', ['Close-Grip Cable Row']],
  ['Wide Grip Cable Row', 'Back', ['Back'], 'Cable', 'Compound', 'Beginner', ['Rear Delts', 'Traps'], 'Upper Back & Rhomboids', ['Wide-Grip Seated Cable Row']],
  ['One Arm Dumbbell Row', 'Back', ['Back'], 'Dumbbell', 'Compound', 'Beginner', ['Biceps', 'Rear Delts'], 'Latissimus Dorsi', ['Single-Arm Dumbbell Row', 'Single Arm Dumbbell Row', 'DB Row']],
  ['Meadows Row', 'Back', ['Back'], 'Landmine', 'Compound', 'Intermediate', ['Biceps', 'Rear Delts', 'Obliques'], 'Latissimus Dorsi & Rear Delts'],
  ['Landmine Row', 'Back', ['Back'], 'Landmine', 'Compound', 'Intermediate', ['Biceps', 'Core'], 'Middle Back & Lats'],
  ['Machine Row', 'Back', ['Back'], 'Machine', 'Compound', 'Beginner', ['Biceps', 'Rear Delts'], 'Middle Back'],
  ['Iso-Lateral Row', 'Back', ['Back'], 'Machine', 'Compound', 'Beginner', ['Biceps', 'Rear Delts'], 'Unilateral Lats & Mid-Back'],
  ['Inverted Row', 'Back', ['Back', 'Calisthenics'], 'Bodyweight', 'Compound', 'Beginner', ['Biceps', 'Core'], 'Rhomboids & Lats', ['Inverted Rows', 'Bodyweight Row']],
  ['Smith Machine Row', 'Back', ['Back'], 'Smith Machine', 'Compound', 'Intermediate', ['Biceps', 'Lower Back'], 'Middle Back & Lats'],
  ['Seal Row', 'Back', ['Back'], 'Barbell', 'Compound', 'Intermediate', ['Biceps', 'Rear Delts'], 'Upper & Middle Back'],
  ['Conventional Deadlift', 'Back', ['Back', 'Legs', 'Full Body'], 'Barbell', 'Compound', 'Advanced', ['Hamstrings', 'Glutes', 'Forearms', 'Traps'], 'Posterior Chain & Spinal Erectors', ['Deadlift', 'Deadlifts', 'Barbell Deadlift']],
  ['Sumo Deadlift', 'Back', ['Back', 'Legs'], 'Barbell', 'Compound', 'Advanced', ['Glutes', 'Adductors', 'Quads'], 'Hamstrings, Glutes & Back'],
  ['Romanian Deadlift', 'Back', ['Back', 'Legs', 'Glutes'], 'Barbell', 'Compound', 'Intermediate', ['Glutes', 'Lower Back'], 'Hamstrings & Glutes', ['RDL', 'Barbell RDL']],
  ['Stiff Leg Deadlift', 'Back', ['Back', 'Legs'], 'Barbell', 'Compound', 'Intermediate', ['Glutes', 'Lower Back'], 'Hamstrings & Erectors', ['Stiff-Legged Deadlift', 'SLDL']],
  ['Rack Pull', 'Back', ['Back', 'Traps'], 'Barbell', 'Compound', 'Intermediate', ['Glutes', 'Forearms'], 'Upper Back, Traps & Erectors', ['Rack Pulls']],
  ['Good Morning', 'Back', ['Back', 'Legs'], 'Barbell', 'Compound', 'Intermediate', ['Glutes', 'Lower Back'], 'Hamstrings & Spinal Erectors', ['Good Mornings']],
  ['Back Extensions', 'Back', ['Back'], 'Bodyweight', 'Isolation', 'Beginner', ['Glutes', 'Hamstrings'], 'Erector Spinae', ['Back Extension']],
  ['Hyperextensions', 'Back', ['Back', 'Glutes'], 'Bodyweight', 'Isolation', 'Beginner', ['Glutes', 'Hamstrings'], 'Spinal Erectors & Glutes'],
  ['Reverse Hyperextension', 'Back', ['Back', 'Legs', 'Glutes'], 'Machine', 'Compound', 'Intermediate', ['Hamstrings', 'Lower Back'], 'Glutes & Spinal Erectors'],
  ['Bird Dog', 'Back', ['Back', 'Abs'], 'Bodyweight', 'Isolation', 'Beginner', ['Glutes', 'Shoulders'], 'Multifidus & Deep Core'],
  ['Superman Hold', 'Back', ['Back'], 'Bodyweight', 'Isolation', 'Beginner', ['Glutes', 'Rear Delts'], 'Lower Back & Spinal Erectors'],

  // ================= 2. BICEPS =================
  ['Standing Barbell Curl', 'Biceps', ['Biceps'], 'Barbell', 'Isolation', 'Beginner', ['Forearms'], 'Biceps Brachii', ['Barbell Curl', 'Barbell Bicep Curl']],
  ['EZ Bar Curl', 'Biceps', ['Biceps'], 'EZ Bar', 'Isolation', 'Beginner', ['Forearms'], 'Biceps Brachii', ['EZ-Bar Curl']],
  ['Dumbbell Curl', 'Biceps', ['Biceps'], 'Dumbbell', 'Isolation', 'Beginner', ['Forearms'], 'Biceps Brachii', ['Dumbbell Bicep Curl']],
  ['Alternating Dumbbell Curl', 'Biceps', ['Biceps'], 'Dumbbell', 'Isolation', 'Beginner', ['Forearms'], 'Biceps Brachii'],
  ['Seated Dumbbell Curl', 'Biceps', ['Biceps'], 'Dumbbell', 'Isolation', 'Beginner', ['Forearms'], 'Biceps Brachii'],
  ['Incline Dumbbell Curl', 'Biceps', ['Biceps'], 'Dumbbell', 'Isolation', 'Intermediate', ['Forearms'], 'Biceps Long Head'],
  ['Preacher Curl', 'Biceps', ['Biceps'], 'Barbell', 'Isolation', 'Beginner', ['Brachialis'], 'Biceps Short Head'],
  ['EZ Bar Preacher Curl', 'Biceps', ['Biceps'], 'EZ Bar', 'Isolation', 'Beginner', ['Brachialis'], 'Biceps Short Head', ['EZ-Bar Preacher Curl']],
  ['Machine Preacher Curl', 'Biceps', ['Biceps'], 'Machine', 'Isolation', 'Beginner', ['Brachialis'], 'Biceps Brachii'],
  ['Concentration Curl', 'Biceps', ['Biceps'], 'Dumbbell', 'Isolation', 'Beginner', ['Brachialis'], 'Biceps Peak'],
  ['Hammer Curl', 'Biceps', ['Biceps', 'Forearms'], 'Dumbbell', 'Isolation', 'Beginner', ['Brachioradialis'], 'Brachialis & Forearms', ['Hammer Curls']],
  ['Cross Body Hammer Curl', 'Biceps', ['Biceps', 'Forearms'], 'Dumbbell', 'Isolation', 'Beginner', ['Brachioradialis'], 'Brachialis & Long Head'],
  ['Rope Hammer Curl', 'Biceps', ['Biceps', 'Forearms'], 'Cable', 'Isolation', 'Beginner', ['Brachioradialis'], 'Brachialis & Forearms'],
  ['Cable Biceps Curl', 'Biceps', ['Biceps'], 'Cable', 'Isolation', 'Beginner', ['Forearms'], 'Biceps Brachii', ['Cable Bicep Curl']],
  ['Straight Bar Cable Curl', 'Biceps', ['Biceps'], 'Cable', 'Isolation', 'Beginner', ['Forearms'], 'Biceps Brachii'],
  ['EZ Bar Cable Curl', 'Biceps', ['Biceps'], 'Cable', 'Isolation', 'Beginner', ['Forearms'], 'Biceps Brachii'],
  ['Single Arm Cable Curl', 'Biceps', ['Biceps'], 'Cable', 'Isolation', 'Beginner', ['Forearms'], 'Unilateral Biceps'],
  ['Bayesian Cable Curl', 'Biceps', ['Biceps'], 'Cable', 'Isolation', 'Intermediate', ['Forearms'], 'Biceps Long Head'],
  ['Spider Curl', 'Biceps', ['Biceps'], 'Dumbbell', 'Isolation', 'Intermediate', ['Forearms'], 'Biceps Short Head'],
  ['Reverse Grip Barbell Curl', 'Biceps', ['Biceps', 'Forearms'], 'Barbell', 'Isolation', 'Intermediate', ['Wrist Extensors'], 'Brachioradialis', ['Reverse Barbell Curls', 'Reverse Barbell Curl']],
  ['Reverse EZ Bar Curl', 'Biceps', ['Biceps', 'Forearms'], 'EZ Bar', 'Isolation', 'Intermediate', ['Wrist Extensors'], 'Brachioradialis', ['Reverse EZ Bar Curls', 'Reverse EZ-Bar Curl']],
  ['Drag Curl', 'Biceps', ['Biceps'], 'Barbell', 'Isolation', 'Intermediate', ['Rear Delts'], 'Biceps Long Head'],
  ['Zottman Curl', 'Biceps', ['Biceps', 'Forearms'], 'Dumbbell', 'Isolation', 'Intermediate', ['Brachioradialis'], 'Biceps & Forearms', ['Zottman Curls']],
  ['Cheat Curl', 'Biceps', ['Biceps'], 'Barbell', 'Isolation', 'Advanced', ['Core', 'Forearms'], 'Biceps Brachii'],
  ['21s Biceps Curl', 'Biceps', ['Biceps'], 'Barbell', 'Isolation', 'Intermediate', ['Forearms'], 'Biceps Brachii', ['21s Barbell Curl']],
  ['High Cable Curl', 'Biceps', ['Biceps'], 'Cable', 'Isolation', 'Intermediate', ['Forearms'], 'Biceps Short Head'],
  ['Waiter Curl', 'Biceps', ['Biceps'], 'Dumbbell', 'Isolation', 'Beginner', ['Forearms'], 'Biceps Short Head'],

  // ================= 3. CHEST =================
  ['Incline Barbell Bench Press', 'Chest', ['Chest'], 'Barbell', 'Compound', 'Intermediate', ['Front Delts', 'Triceps'], 'Upper Pectoralis Major', ['Incline Barbell Press', 'Incline Bench Press']],
  ['Incline Dumbbell Press', 'Chest', ['Chest'], 'Dumbbell', 'Compound', 'Intermediate', ['Front Delts', 'Triceps'], 'Upper Pectoralis Major'],
  ['Incline Smith Machine Press', 'Chest', ['Chest'], 'Smith Machine', 'Compound', 'Beginner', ['Front Delts', 'Triceps'], 'Upper Pectoralis Major', ['Smith Machine Incline Press']],
  ['Incline Machine Press', 'Chest', ['Chest'], 'Machine', 'Compound', 'Beginner', ['Front Delts', 'Triceps'], 'Upper Pectoralis Major'],
  ['Low To High Cable Fly', 'Chest', ['Chest'], 'Cable', 'Isolation', 'Beginner', ['Front Delts'], 'Clavicular Pectoralis Major', ['Low-to-High Cable Fly']],
  ['Incline Dumbbell Fly', 'Chest', ['Chest'], 'Dumbbell', 'Isolation', 'Intermediate', ['Front Delts'], 'Upper Pectoralis Major'],
  ['Reverse Grip Bench Press', 'Chest', ['Chest', 'Triceps'], 'Barbell', 'Compound', 'Intermediate', ['Front Delts'], 'Upper Chest & Triceps'],
  ['Incline Cable Press', 'Chest', ['Chest'], 'Cable', 'Compound', 'Intermediate', ['Front Delts', 'Triceps'], 'Upper Chest'],
  ['Flat Barbell Bench Press', 'Chest', ['Chest'], 'Barbell', 'Compound', 'Intermediate', ['Front Delts', 'Triceps'], 'Sternal Pectoralis Major', ['Bench Press', 'Barbell Bench Press', 'Flat Bench Press']],
  ['Flat Dumbbell Bench Press', 'Chest', ['Chest'], 'Dumbbell', 'Compound', 'Beginner', ['Front Delts', 'Triceps'], 'Pectoralis Major', ['Dumbbell Bench Press']],
  ['Smith Machine Bench Press', 'Chest', ['Chest'], 'Smith Machine', 'Compound', 'Beginner', ['Front Delts', 'Triceps'], 'Pectoralis Major'],
  ['Machine Chest Press', 'Chest', ['Chest'], 'Machine', 'Compound', 'Beginner', ['Front Delts', 'Triceps'], 'Pectoralis Major'],
  ['Dumbbell Chest Fly', 'Chest', ['Chest'], 'Dumbbell', 'Isolation', 'Beginner', ['Front Delts'], 'Pectoralis Major'],
  ['Cable Chest Fly', 'Chest', ['Chest'], 'Cable', 'Isolation', 'Beginner', ['Front Delts'], 'Pectoralis Major'],
  ['Pec Deck Fly', 'Chest', ['Chest'], 'Machine', 'Isolation', 'Beginner', ['Front Delts'], 'Pectoralis Major', ['Pec Deck']],
  ['Push-Ups', 'Chest', ['Chest', 'Calisthenics'], 'Bodyweight', 'Compound', 'Beginner', ['Triceps', 'Front Delts', 'Core'], 'Pectoralis Major', ['Pushups', 'Push Ups']],
  ['Wide Grip Push-Ups', 'Chest', ['Chest', 'Calisthenics'], 'Bodyweight', 'Compound', 'Beginner', ['Front Delts', 'Triceps'], 'Outer Pectorals'],
  ['Standard Push-Ups', 'Chest', ['Chest', 'Calisthenics'], 'Bodyweight', 'Compound', 'Beginner', ['Triceps', 'Core'], 'Pectoralis Major'],
  ['Chest Press Machine', 'Chest', ['Chest'], 'Machine', 'Compound', 'Beginner', ['Triceps', 'Front Delts'], 'Pectoralis Major'],
  ['Plate Loaded Chest Press', 'Chest', ['Chest'], 'Machine', 'Compound', 'Beginner', ['Triceps', 'Front Delts'], 'Pectoralis Major'],
  ['Decline Barbell Bench Press', 'Chest', ['Chest'], 'Barbell', 'Compound', 'Intermediate', ['Triceps', 'Front Delts'], 'Lower Pectoralis Major'],
  ['Decline Dumbbell Press', 'Chest', ['Chest'], 'Dumbbell', 'Compound', 'Intermediate', ['Triceps', 'Front Delts'], 'Lower Pectoralis Major'],
  ['Decline Machine Press', 'Chest', ['Chest'], 'Machine', 'Compound', 'Beginner', ['Triceps'], 'Lower Pectoralis Major'],
  ['High To Low Cable Fly', 'Chest', ['Chest'], 'Cable', 'Isolation', 'Beginner', ['Front Delts'], 'Lower Pectoralis Major', ['High-to-Low Cable Fly']],
  ['Chest Dips', 'Chest', ['Chest', 'Triceps', 'Calisthenics'], 'Bodyweight', 'Compound', 'Intermediate', ['Triceps', 'Front Delts'], 'Lower Chest', ['Weighted Dips', 'Dips']],
  ['Decline Push-Ups', 'Chest', ['Chest', 'Calisthenics'], 'Bodyweight', 'Compound', 'Intermediate', ['Front Delts', 'Triceps'], 'Upper Chest'],
  ['Decline Cable Press', 'Chest', ['Chest'], 'Cable', 'Compound', 'Beginner', ['Triceps'], 'Lower Pectoralis Major'],
  ['Svend Press', 'Chest', ['Chest'], 'Plate', 'Isolation', 'Beginner', ['Front Delts'], 'Inner Pectoralis Major'],
  ['Dumbbell Squeeze Press', 'Chest', ['Chest'], 'Dumbbell', 'Compound', 'Beginner', ['Triceps'], 'Inner Pectoralis Major'],
  ['Hex Press', 'Chest', ['Chest'], 'Dumbbell', 'Compound', 'Beginner', ['Triceps'], 'Inner Pectoralis Major'],
  ['Single Arm Cable Fly', 'Chest', ['Chest'], 'Cable', 'Isolation', 'Intermediate', ['Core', 'Front Delts'], 'Unilateral Pectoralis Major'],
  ['Standing Cable Press', 'Chest', ['Chest'], 'Cable', 'Compound', 'Beginner', ['Core', 'Triceps'], 'Pectoralis Major'],

  // ================= 4. TRICEPS =================
  ['Rope Triceps Pushdown', 'Triceps', ['Triceps'], 'Cable', 'Isolation', 'Beginner', ['Forearms'], 'Lateral & Medial Tricep Heads', ['Rope Tricep Pushdown']],
  ['Straight Bar Pushdown', 'Triceps', ['Triceps'], 'Cable', 'Isolation', 'Beginner', ['Forearms'], 'Triceps Brachii', ['Straight-Bar Tricep Pushdown']],
  ['V-Bar Pushdown', 'Triceps', ['Triceps'], 'Cable', 'Isolation', 'Beginner', ['Forearms'], 'Triceps Brachii'],
  ['Reverse Grip Pushdown', 'Triceps', ['Triceps'], 'Cable', 'Isolation', 'Beginner', ['Forearms'], 'Medial Tricep Head'],
  ['Single Arm Cable Pushdown', 'Triceps', ['Triceps'], 'Cable', 'Isolation', 'Beginner', ['Forearms'], 'Unilateral Triceps'],
  ['Cross Body Cable Extension', 'Triceps', ['Triceps'], 'Cable', 'Isolation', 'Intermediate', ['Rear Delts'], 'Triceps Lateral & Long Head'],
  ['Overhead Rope Extension', 'Triceps', ['Triceps'], 'Cable', 'Isolation', 'Beginner', ['Core'], 'Triceps Long Head', ['Overhead Cable Rope Extension']],
  ['Overhead Cable Extension', 'Triceps', ['Triceps'], 'Cable', 'Isolation', 'Beginner', ['Core'], 'Triceps Long Head'],
  ['Dumbbell Overhead Extension', 'Triceps', ['Triceps'], 'Dumbbell', 'Isolation', 'Beginner', ['Core'], 'Triceps Long Head', ['Overhead Dumbbell Tricep Extension']],
  ['Single Arm Dumbbell Extension', 'Triceps', ['Triceps'], 'Dumbbell', 'Isolation', 'Beginner', ['Shoulder Stabilizers'], 'Triceps Long Head'],
  ['EZ Bar Skull Crushers', 'Triceps', ['Triceps'], 'EZ Bar', 'Isolation', 'Intermediate', ['Forearms'], 'Triceps Long & Medial Heads', ['Skull Crushers']],
  ['Barbell Skull Crushers', 'Triceps', ['Triceps'], 'Barbell', 'Isolation', 'Intermediate', ['Forearms'], 'Triceps Brachii'],
  ['Dumbbell Skull Crushers', 'Triceps', ['Triceps'], 'Dumbbell', 'Isolation', 'Intermediate', ['Forearms'], 'Triceps Brachii'],
  ['Lying Triceps Extension', 'Triceps', ['Triceps'], 'EZ Bar', 'Isolation', 'Intermediate', ['Forearms'], 'Triceps Long Head'],
  ['Incline Skull Crushers', 'Triceps', ['Triceps'], 'EZ Bar', 'Isolation', 'Intermediate', ['Forearms'], 'Triceps Long Head'],
  ['Close Grip Bench Press', 'Triceps', ['Triceps', 'Chest'], 'Barbell', 'Compound', 'Intermediate', ['Chest', 'Front Delts'], 'Triceps Brachii', ['Close-Grip Bench Press']],
  ['Smith Machine Close Grip Press', 'Triceps', ['Triceps', 'Chest'], 'Smith Machine', 'Compound', 'Beginner', ['Chest', 'Front Delts'], 'Triceps Brachii'],
  ['Bench Dips', 'Triceps', ['Triceps'], 'Bodyweight', 'Compound', 'Beginner', ['Front Delts', 'Chest'], 'Triceps Brachii'],
  ['Parallel Bar Dips', 'Triceps', ['Triceps', 'Chest', 'Calisthenics'], 'Bodyweight', 'Compound', 'Intermediate', ['Chest', 'Front Delts'], 'Triceps & Lower Chest', ['Tricep Dips']],
  ['Diamond Push-Ups', 'Triceps', ['Triceps', 'Calisthenics', 'Chest'], 'Bodyweight', 'Compound', 'Intermediate', ['Chest', 'Core'], 'Triceps Brachii'],
  ['Triceps Kickbacks', 'Triceps', ['Triceps'], 'Dumbbell', 'Isolation', 'Beginner', ['Rear Delts'], 'Triceps Lateral Head', ['Dumbbell Tricep Kickback']],
  ['Cable Kickbacks', 'Triceps', ['Triceps'], 'Cable', 'Isolation', 'Beginner', ['Rear Delts'], 'Triceps Brachii', ['Cable Tricep Kickback']],
  ['Machine Triceps Extension', 'Triceps', ['Triceps'], 'Machine', 'Isolation', 'Beginner', ['Forearms'], 'Triceps Brachii'],
  ['JM Press', 'Triceps', ['Triceps'], 'Barbell', 'Compound', 'Advanced', ['Front Delts', 'Chest'], 'Triceps Brachii'],
  ['Reverse Grip Cable Extension', 'Triceps', ['Triceps'], 'Cable', 'Isolation', 'Beginner', ['Forearms'], 'Medial Tricep Head'],
  ['Tate Press', 'Triceps', ['Triceps'], 'Dumbbell', 'Isolation', 'Intermediate', ['Chest'], 'Triceps Lateral & Medial Heads'],

  // ================= 5. LEGS =================
  ['Barbell Back Squat', 'Legs', ['Legs', 'Glutes', 'Full Body'], 'Barbell', 'Compound', 'Intermediate', ['Glutes', 'Lower Back', 'Core'], 'Quadriceps & Glutes', ['Squat', 'Squats', 'Back Squat']],
  ['Front Squat', 'Legs', ['Legs'], 'Barbell', 'Compound', 'Advanced', ['Core', 'Upper Back', 'Glutes'], 'Quadriceps'],
  ['Goblet Squat', 'Legs', ['Legs'], 'Dumbbell', 'Compound', 'Beginner', ['Glutes', 'Core'], 'Quadriceps'],
  ['Hack Squat', 'Legs', ['Legs'], 'Machine', 'Compound', 'Intermediate', ['Glutes'], 'Quadriceps'],
  ['Smith Machine Squat', 'Legs', ['Legs'], 'Smith Machine', 'Compound', 'Beginner', ['Glutes'], 'Quadriceps'],
  ['Leg Press', 'Legs', ['Legs', 'Glutes'], 'Machine', 'Compound', 'Beginner', ['Glutes', 'Hamstrings'], 'Quadriceps'],
  ['Single Leg Press', 'Legs', ['Legs', 'Glutes'], 'Machine', 'Compound', 'Intermediate', ['Glutes'], 'Unilateral Quadriceps'],
  ['Bulgarian Split Squat', 'Legs', ['Legs', 'Glutes'], 'Dumbbell', 'Compound', 'Intermediate', ['Glutes', 'Core'], 'Quadriceps & Glutes'],
  ['Walking Lunges', 'Legs', ['Legs', 'Glutes'], 'Dumbbell', 'Compound', 'Beginner', ['Glutes', 'Calves'], 'Quadriceps & Glutes'],
  ['Reverse Lunges', 'Legs', ['Legs', 'Glutes'], 'Dumbbell', 'Compound', 'Beginner', ['Glutes'], 'Quadriceps & Glutes'],
  ['Forward Lunges', 'Legs', ['Legs'], 'Dumbbell', 'Compound', 'Beginner', ['Glutes', 'Core'], 'Quadriceps'],
  ['Dumbbell Lunges', 'Legs', ['Legs', 'Glutes'], 'Dumbbell', 'Compound', 'Beginner', ['Glutes', 'Forearms'], 'Quadriceps & Glutes'],
  ['Leg Extension', 'Legs', ['Legs'], 'Machine', 'Isolation', 'Beginner', [], 'Quadriceps (Rectus Femoris & VMO)'],
  ['Sissy Squat', 'Legs', ['Legs'], 'Bodyweight', 'Isolation', 'Advanced', ['Core'], 'Quadriceps'],
  ['Step-Ups', 'Legs', ['Legs', 'Glutes'], 'Dumbbell', 'Compound', 'Beginner', ['Glutes', 'Calves'], 'Quadriceps & Glutes'],
  ['Zercher Squat', 'Legs', ['Legs', 'Full Body'], 'Barbell', 'Compound', 'Advanced', ['Core', 'Upper Back', 'Glutes'], 'Quadriceps & Anterior Chain'],
  ['Box Squat', 'Legs', ['Legs', 'Glutes'], 'Barbell', 'Compound', 'Intermediate', ['Hamstrings', 'Lower Back'], 'Glutes & Quadriceps'],
  ['Heel Elevated Squat', 'Legs', ['Legs'], 'Barbell', 'Compound', 'Intermediate', ['Glutes', 'Core'], 'Quadriceps'],
  ['Pistol Squat', 'Legs', ['Legs', 'Calisthenics', 'Glutes'], 'Bodyweight', 'Compound', 'Advanced', ['Glutes', 'Core', 'Ankle Stabilizers'], 'Unilateral Quadriceps & Glutes', ['Pistol Squats']],
  ['Lying Leg Curl', 'Legs', ['Legs'], 'Machine', 'Isolation', 'Beginner', ['Calves'], 'Hamstrings'],
  ['Seated Leg Curl', 'Legs', ['Legs'], 'Machine', 'Isolation', 'Beginner', ['Calves'], 'Hamstrings'],
  ['Standing Leg Curl', 'Legs', ['Legs'], 'Machine', 'Isolation', 'Beginner', ['Glutes'], 'Hamstrings'],
  ['Single Leg Curl', 'Legs', ['Legs'], 'Machine', 'Isolation', 'Beginner', ['Calves'], 'Unilateral Hamstrings'],
  ['Nordic Hamstring Curl', 'Legs', ['Legs', 'Calisthenics'], 'Bodyweight', 'Isolation', 'Advanced', ['Glutes', 'Calves'], 'Hamstrings', ['Nordic Curls']],
  ['Glute Ham Raise', 'Legs', ['Legs', 'Glutes'], 'Bodyweight', 'Compound', 'Advanced', ['Glutes', 'Calves', 'Lower Back'], 'Hamstrings & Glutes'],
  ['Cable Leg Curl', 'Legs', ['Legs'], 'Cable', 'Isolation', 'Beginner', ['Glutes'], 'Hamstrings'],
  ['Barbell Hip Thrust', 'Legs', ['Legs', 'Glutes'], 'Barbell', 'Compound', 'Intermediate', ['Hamstrings', 'Core'], 'Gluteus Maximus', ['Hip Thrust']],
  ['Dumbbell Hip Thrust', 'Legs', ['Legs', 'Glutes'], 'Dumbbell', 'Compound', 'Beginner', ['Hamstrings', 'Core'], 'Gluteus Maximus'],
  ['Glute Bridge', 'Legs', ['Legs', 'Glutes'], 'Bodyweight', 'Compound', 'Beginner', ['Hamstrings', 'Core'], 'Gluteus Maximus'],
  ['Single Leg Glute Bridge', 'Legs', ['Legs', 'Glutes'], 'Bodyweight', 'Compound', 'Beginner', ['Hamstrings', 'Core'], 'Glutes & Hip Stability'],
  ['Cable Glute Kickback', 'Legs', ['Legs', 'Glutes'], 'Cable', 'Isolation', 'Beginner', ['Hamstrings'], 'Gluteus Maximus'],
  ['Machine Glute Kickback', 'Legs', ['Legs', 'Glutes'], 'Machine', 'Isolation', 'Beginner', ['Hamstrings'], 'Gluteus Maximus'],
  ['Sumo Squat', 'Legs', ['Legs', 'Glutes'], 'Dumbbell', 'Compound', 'Beginner', ['Adductors', 'Quads'], 'Glutes & Inner Thighs'],
  ['Frog Pumps', 'Legs', ['Legs', 'Glutes'], 'Bodyweight', 'Isolation', 'Beginner', ['Adductors'], 'Gluteus Maximus'],
  ['Cable Pull Through', 'Legs', ['Legs', 'Glutes'], 'Cable', 'Compound', 'Beginner', ['Hamstrings', 'Lower Back'], 'Glutes & Hamstrings'],
  ['Hip Abduction', 'Legs', ['Legs', 'Glutes'], 'Bodyweight', 'Isolation', 'Beginner', ['Core'], 'Gluteus Medius'],
  ['Standing Calf Raise', 'Legs', ['Legs'], 'Machine', 'Isolation', 'Beginner', [], 'Gastrocnemius'],
  ['Seated Calf Raise', 'Legs', ['Legs'], 'Machine', 'Isolation', 'Beginner', [], 'Soleus'],
  ['Leg Press Calf Raise', 'Legs', ['Legs'], 'Machine', 'Isolation', 'Beginner', [], 'Gastrocnemius & Soleus'],
  ['Smith Machine Calf Raise', 'Legs', ['Legs'], 'Smith Machine', 'Isolation', 'Beginner', [], 'Gastrocnemius'],
  ['Single Leg Calf Raise', 'Legs', ['Legs'], 'Dumbbell', 'Isolation', 'Beginner', [], 'Unilateral Calves'],
  ['Donkey Calf Raise', 'Legs', ['Legs'], 'Machine', 'Isolation', 'Intermediate', [], 'Gastrocnemius'],
  ['Tibialis Raise', 'Legs', ['Legs'], 'Bodyweight', 'Isolation', 'Beginner', [], 'Tibialis Anterior'],
  ['Toe Raises', 'Legs', ['Legs'], 'Bodyweight', 'Isolation', 'Beginner', [], 'Tibialis Anterior & Calves'],
  ['Hip Adduction Machine', 'Legs', ['Legs'], 'Machine', 'Isolation', 'Beginner', [], 'Hip Adductors'],
  ['Hip Abduction Machine', 'Legs', ['Legs', 'Glutes'], 'Machine', 'Isolation', 'Beginner', [], 'Gluteus Medius & Minimus'],
  ['Cable Hip Adduction', 'Legs', ['Legs'], 'Cable', 'Isolation', 'Beginner', ['Core'], 'Hip Adductors'],
  ['Cable Hip Abduction', 'Legs', ['Legs', 'Glutes'], 'Cable', 'Isolation', 'Beginner', ['Core'], 'Gluteus Medius'],
  ['Copenhagen Plank', 'Legs', ['Legs', 'Abs'], 'Bodyweight', 'Isolation', 'Advanced', ['Obliques', 'Core'], 'Hip Adductors'],
  ['Side Lying Hip Abduction', 'Legs', ['Legs', 'Glutes'], 'Bodyweight', 'Isolation', 'Beginner', [], 'Gluteus Medius'],

  // ================= 6. SHOULDERS =================
  ['Barbell Overhead Press', 'Shoulders', ['Shoulders'], 'Barbell', 'Compound', 'Intermediate', ['Triceps', 'Upper Chest', 'Core'], 'Anterior & Lateral Deltoids', ['Overhead Barbell Press', 'OHP', 'Military Press']],
  ['Seated Dumbbell Shoulder Press', 'Shoulders', ['Shoulders'], 'Dumbbell', 'Compound', 'Beginner', ['Triceps', 'Traps'], 'Anterior Deltoids'],
  ['Standing Dumbbell Press', 'Shoulders', ['Shoulders'], 'Dumbbell', 'Compound', 'Intermediate', ['Triceps', 'Core'], 'Anterior & Lateral Deltoids'],
  ['Arnold Press', 'Shoulders', ['Shoulders'], 'Dumbbell', 'Compound', 'Intermediate', ['Triceps'], 'Anterior & Lateral Deltoids'],
  ['Smith Machine Shoulder Press', 'Shoulders', ['Shoulders'], 'Smith Machine', 'Compound', 'Beginner', ['Triceps'], 'Anterior Deltoids'],
  ['Machine Shoulder Press', 'Shoulders', ['Shoulders'], 'Machine', 'Compound', 'Beginner', ['Triceps'], 'Anterior Deltoids'],
  ['Front Dumbbell Raise', 'Shoulders', ['Shoulders'], 'Dumbbell', 'Isolation', 'Beginner', ['Upper Chest'], 'Anterior Deltoid'],
  ['Barbell Front Raise', 'Shoulders', ['Shoulders'], 'Barbell', 'Isolation', 'Beginner', ['Upper Chest'], 'Anterior Deltoid'],
  ['Cable Front Raise', 'Shoulders', ['Shoulders'], 'Cable', 'Isolation', 'Beginner', ['Upper Chest'], 'Anterior Deltoid'],
  ['Plate Front Raise', 'Shoulders', ['Shoulders'], 'Plate', 'Isolation', 'Beginner', ['Forearms'], 'Anterior Deltoid'],
  ['Landmine Press', 'Shoulders', ['Shoulders', 'Chest'], 'Landmine', 'Compound', 'Intermediate', ['Upper Chest', 'Triceps', 'Core'], 'Anterior Deltoid'],
  ['Z Press', 'Shoulders', ['Shoulders'], 'Barbell', 'Compound', 'Advanced', ['Core', 'Triceps', 'Upper Back'], 'Deltoids & Core Stability'],
  ['Dumbbell Lateral Raise', 'Shoulders', ['Shoulders'], 'Dumbbell', 'Isolation', 'Beginner', ['Upper Traps'], 'Lateral Deltoid', ['Lateral Raises']],
  ['Seated Lateral Raise', 'Shoulders', ['Shoulders'], 'Dumbbell', 'Isolation', 'Beginner', ['Upper Traps'], 'Lateral Deltoid'],
  ['Cable Lateral Raise', 'Shoulders', ['Shoulders'], 'Cable', 'Isolation', 'Beginner', ['Upper Traps'], 'Lateral Deltoid'],
  ['Single Arm Cable Lateral Raise', 'Shoulders', ['Shoulders'], 'Cable', 'Isolation', 'Beginner', ['Core'], 'Unilateral Lateral Deltoid'],
  ['Machine Lateral Raise', 'Shoulders', ['Shoulders'], 'Machine', 'Isolation', 'Beginner', [], 'Lateral Deltoid'],
  ['Leaning Cable Lateral Raise', 'Shoulders', ['Shoulders'], 'Cable', 'Isolation', 'Intermediate', ['Upper Traps'], 'Lateral Deltoid'],
  ['Behind The Back Cable Lateral Raise', 'Shoulders', ['Shoulders'], 'Cable', 'Isolation', 'Intermediate', ['Upper Traps'], 'Lateral Deltoid'],
  ['Partial Lateral Raise', 'Shoulders', ['Shoulders'], 'Dumbbell', 'Isolation', 'Intermediate', ['Upper Traps'], 'Lateral Deltoid'],
  ['Reverse Pec Deck Fly', 'Shoulders', ['Shoulders'], 'Machine', 'Isolation', 'Beginner', ['Rhomboids', 'Middle Traps'], 'Posterior Deltoid'],
  ['Bent Over Dumbbell Reverse Fly', 'Shoulders', ['Shoulders'], 'Dumbbell', 'Isolation', 'Beginner', ['Rhomboids'], 'Posterior Deltoid', ['Bent-Over Rear Delt Fly']],
  ['Cable Reverse Fly', 'Shoulders', ['Shoulders'], 'Cable', 'Isolation', 'Beginner', ['Rhomboids'], 'Posterior Deltoid'],
  ['Single Arm Reverse Cable Fly', 'Shoulders', ['Shoulders'], 'Cable', 'Isolation', 'Intermediate', ['Rhomboids'], 'Posterior Deltoid'],
  ['Face Pull', 'Shoulders', ['Shoulders', 'Traps'], 'Cable', 'Isolation', 'Beginner', ['Middle Traps', 'Rhomboids', 'Rotator Cuff'], 'Posterior Deltoid & External Rotators', ['Face Pulls']],
  ['Rear Delt Row', 'Shoulders', ['Shoulders', 'Back'], 'Dumbbell', 'Compound', 'Intermediate', ['Rhomboids', 'Biceps'], 'Posterior Deltoid'],
  ['Chest Supported Rear Delt Raise', 'Shoulders', ['Shoulders'], 'Dumbbell', 'Isolation', 'Beginner', ['Rhomboids'], 'Posterior Deltoid'],
  ['Incline Rear Delt Fly', 'Shoulders', ['Shoulders'], 'Dumbbell', 'Isolation', 'Beginner', ['Rhomboids'], 'Posterior Deltoid'],
  ['Band Pull Apart', 'Shoulders', ['Shoulders', 'Traps'], 'Band', 'Isolation', 'Beginner', ['Rhomboids'], 'Posterior Deltoid & Scapular Retractors'],

  // ================= 7. ABS =================
  ['Crunches', 'Abs', ['Abs'], 'Bodyweight', 'Isolation', 'Beginner', [], 'Rectus Abdominis'],
  ['Sit-Ups', 'Abs', ['Abs'], 'Bodyweight', 'Compound', 'Beginner', ['Hip Flexors'], 'Rectus Abdominis'],
  ['Weighted Crunches', 'Abs', ['Abs'], 'Plate', 'Isolation', 'Beginner', [], 'Rectus Abdominis'],
  ['Cable Crunches', 'Abs', ['Abs'], 'Cable', 'Isolation', 'Intermediate', ['Serratus'], 'Rectus Abdominis', ['Cable Crunch']],
  ['Machine Crunches', 'Abs', ['Abs'], 'Machine', 'Isolation', 'Beginner', [], 'Rectus Abdominis', ['Machine Crunch']],
  ['Decline Sit-Ups', 'Abs', ['Abs'], 'Bodyweight', 'Compound', 'Intermediate', ['Hip Flexors'], 'Rectus Abdominis'],
  ['Stability Ball Crunches', 'Abs', ['Abs'], 'Other', 'Isolation', 'Beginner', [], 'Rectus Abdominis'],
  ['Reverse Crunches', 'Abs', ['Abs'], 'Bodyweight', 'Isolation', 'Beginner', ['Hip Flexors'], 'Lower Rectus Abdominis'],
  ['Toe Touches', 'Abs', ['Abs'], 'Bodyweight', 'Isolation', 'Beginner', [], 'Upper Rectus Abdominis'],
  ['Hanging Leg Raises', 'Abs', ['Abs'], 'Bodyweight', 'Compound', 'Intermediate', ['Hip Flexors', 'Forearms'], 'Lower Abs'],
  ['Hanging Knee Raises', 'Abs', ['Abs'], 'Bodyweight', 'Compound', 'Beginner', ['Hip Flexors', 'Forearms'], 'Lower Abs'],
  ["Captain's Chair Leg Raises", 'Abs', ['Abs'], 'Bodyweight', 'Compound', 'Beginner', ['Hip Flexors'], 'Lower Abs', ['Captains Chair Leg Raise']],
  ['Lying Leg Raises', 'Abs', ['Abs'], 'Bodyweight', 'Isolation', 'Beginner', ['Hip Flexors'], 'Lower Abs'],
  ['Bench Leg Raises', 'Abs', ['Abs'], 'Bodyweight', 'Isolation', 'Beginner', ['Hip Flexors'], 'Lower Abs'],
  ['V-Ups', 'Abs', ['Abs'], 'Bodyweight', 'Compound', 'Intermediate', ['Hip Flexors'], 'Full Rectus Abdominis'],
  ['Flutter Kicks', 'Abs', ['Abs'], 'Bodyweight', 'Isolation', 'Beginner', ['Hip Flexors'], 'Lower Abs'],
  ['Scissor Kicks', 'Abs', ['Abs'], 'Bodyweight', 'Isolation', 'Beginner', ['Hip Flexors'], 'Lower Abs'],
  ['Dragon Flag', 'Abs', ['Abs', 'Calisthenics'], 'Bodyweight', 'Compound', 'Advanced', ['Lats', 'Hip Flexors'], 'Entire Anterior Core'],
  ['Garhammer Raise', 'Abs', ['Abs'], 'Bodyweight', 'Isolation', 'Intermediate', ['Hip Flexors'], 'Lower Abs'],
  ['Russian Twists', 'Abs', ['Abs'], 'Bodyweight', 'Isolation', 'Beginner', ['Hip Flexors'], 'Obliques'],
  ['Cable Woodchoppers', 'Abs', ['Abs'], 'Cable', 'Compound', 'Intermediate', ['Shoulders', 'Hips'], 'Obliques & Core Rotation'],
  ['Side Crunches', 'Abs', ['Abs'], 'Bodyweight', 'Isolation', 'Beginner', [], 'Obliques'],
  ['Bicycle Crunches', 'Abs', ['Abs'], 'Bodyweight', 'Compound', 'Beginner', ['Hip Flexors'], 'Rectus Abdominis & Obliques'],
  ['Side Plank', 'Abs', ['Abs'], 'Bodyweight', 'Isolation', 'Beginner', ['Glute Medius', 'Shoulders'], 'Obliques & Quadratus Lumborum'],
  ['Weighted Side Bends', 'Abs', ['Abs'], 'Dumbbell', 'Isolation', 'Beginner', ['Lower Back'], 'Obliques'],
  ['Hanging Oblique Knee Raises', 'Abs', ['Abs'], 'Bodyweight', 'Compound', 'Intermediate', ['Forearms', 'Hip Flexors'], 'Obliques & Lower Abs'],
  ['Heel Touches', 'Abs', ['Abs'], 'Bodyweight', 'Isolation', 'Beginner', [], 'Obliques'],
  ['Landmine Rotations', 'Abs', ['Abs'], 'Landmine', 'Compound', 'Intermediate', ['Shoulders', 'Hips'], 'Obliques & Rotational Power'],
  ['Plank', 'Abs', ['Abs'], 'Bodyweight', 'Isolation', 'Beginner', ['Shoulders', 'Glutes'], 'Transverse Abdominis', ['Plank Hold']],
  ['RKC Plank', 'Abs', ['Abs'], 'Bodyweight', 'Isolation', 'Intermediate', ['Glutes', 'Lats'], 'Deep Core Tension'],
  ['Ab Wheel Rollout', 'Abs', ['Abs'], 'Other', 'Compound', 'Intermediate', ['Lats', 'Shoulders'], 'Rectus Abdominis & Anti-Extension'],
  ['Dead Bug', 'Abs', ['Abs'], 'Bodyweight', 'Isolation', 'Beginner', ['Hip Flexors'], 'Transverse Abdominis'],
  ['Hollow Body Hold', 'Abs', ['Abs', 'Calisthenics'], 'Bodyweight', 'Isolation', 'Intermediate', ['Hip Flexors'], 'Anterior Core'],
  ['Mountain Climbers', 'Abs', ['Abs', 'Cardio'], 'Bodyweight', 'Cardio', 'Beginner', ['Shoulders', 'Hip Flexors'], 'Core & Conditioning'],
  ['Pallof Press', 'Abs', ['Abs'], 'Cable', 'Isolation', 'Beginner', ['Shoulders', 'Glutes'], 'Anti-Rotation Core & Obliques'],
  ['Bear Crawl', 'Abs', ['Abs', 'Full Body'], 'Bodyweight', 'Compound', 'Intermediate', ['Shoulders', 'Quads'], 'Core Stability & Coordination'],

  // ================= 8. FOREARMS =================
  ['Wrist Curls', 'Forearms', ['Forearms'], 'Barbell', 'Isolation', 'Beginner', [], 'Wrist Flexors'],
  ['Reverse Wrist Curls', 'Forearms', ['Forearms'], 'Barbell', 'Isolation', 'Beginner', [], 'Wrist Extensors'],
  ['Barbell Wrist Curls', 'Forearms', ['Forearms'], 'Barbell', 'Isolation', 'Beginner', [], 'Wrist Flexors'],
  ['Dumbbell Wrist Curls', 'Forearms', ['Forearms'], 'Dumbbell', 'Isolation', 'Beginner', [], 'Wrist Flexors'],
  ['Behind The Back Wrist Curl', 'Forearms', ['Forearms'], 'Barbell', 'Isolation', 'Beginner', [], 'Wrist Flexors', ['Behind-the-Back Barbell Wrist Curl']],
  ['Reverse Barbell Wrist Curl', 'Forearms', ['Forearms'], 'Barbell', 'Isolation', 'Beginner', [], 'Wrist Extensors'],
  ['Reverse Dumbbell Wrist Curl', 'Forearms', ['Forearms'], 'Dumbbell', 'Isolation', 'Beginner', [], 'Wrist Extensors'],
  ["Farmer's Walk", 'Forearms', ['Forearms', 'Traps'], 'Dumbbell', 'Compound', 'Beginner', ['Traps', 'Core', 'Legs'], 'Grip Strength & Upper Traps', ['Farmers Walk', 'Farmers Carry']],
  ["Farmer's Hold", 'Forearms', ['Forearms'], 'Dumbbell', 'Isolation', 'Beginner', ['Traps', 'Core'], 'Isometric Grip Strength'],
  ['Dead Hangs', 'Forearms', ['Forearms'], 'Bodyweight', 'Isolation', 'Beginner', ['Lats', 'Shoulders'], 'Grip Endurance', ['Dead Hang']],
  ['Towel Dead Hangs', 'Forearms', ['Forearms'], 'Other', 'Isolation', 'Intermediate', ['Lats'], 'Crush Grip & Forearms'],
  ['Plate Pinch Holds', 'Forearms', ['Forearms'], 'Plate', 'Isolation', 'Beginner', [], 'Thumb & Pinch Grip', ['Plate Pinch Hold']],
  ['Plate Pinch Walk', 'Forearms', ['Forearms'], 'Plate', 'Compound', 'Intermediate', ['Core'], 'Pinch Grip Strength'],
  ['Wrist Roller', 'Forearms', ['Forearms'], 'Other', 'Isolation', 'Beginner', ['Shoulders'], 'Forearm Flexors & Extensors'],
  ['Finger Curls', 'Forearms', ['Forearms'], 'Barbell', 'Isolation', 'Beginner', [], 'Finger Flexors'],
  ['Gripper Squeezes', 'Forearms', ['Forearms'], 'Other', 'Isolation', 'Beginner', [], 'Crush Grip'],
  ['Captains of Crush Gripper', 'Forearms', ['Forearms'], 'Other', 'Isolation', 'Intermediate', [], 'Maximal Crush Grip'],
  ['Cable Wrist Curls', 'Forearms', ['Forearms'], 'Cable', 'Isolation', 'Beginner', [], 'Wrist Flexors'],
  ['Pronation and Supination', 'Forearms', ['Forearms'], 'Dumbbell', 'Isolation', 'Beginner', [], 'Pronator Teres & Supinator'],
  ['Dumbbell Radial Deviation', 'Forearms', ['Forearms'], 'Dumbbell', 'Isolation', 'Beginner', [], 'Radial Wrist Stabilizers'],
  ['Dumbbell Ulnar Deviation', 'Forearms', ['Forearms'], 'Dumbbell', 'Isolation', 'Beginner', [], 'Ulnar Wrist Stabilizers'],

  // ================= 9. TRAPS =================
  ['Barbell Shrugs', 'Traps', ['Traps', 'Shoulders'], 'Barbell', 'Isolation', 'Beginner', ['Forearms'], 'Upper Trapezius'],
  ['Dumbbell Shrugs', 'Traps', ['Traps', 'Shoulders'], 'Dumbbell', 'Isolation', 'Beginner', ['Forearms'], 'Upper Trapezius'],
  ['Smith Machine Shrugs', 'Traps', ['Traps'], 'Smith Machine', 'Isolation', 'Beginner', ['Forearms'], 'Upper Trapezius'],
  ['Machine Shrugs', 'Traps', ['Traps'], 'Machine', 'Isolation', 'Beginner', ['Forearms'], 'Upper Trapezius'],
  ['Behind The Back Shrugs', 'Traps', ['Traps'], 'Barbell', 'Isolation', 'Intermediate', ['Forearms'], 'Upper & Middle Traps'],
  ['Cable Shrugs', 'Traps', ['Traps'], 'Cable', 'Isolation', 'Beginner', ['Forearms'], 'Upper Trapezius'],
  ['Incline Shrugs', 'Traps', ['Traps'], 'Dumbbell', 'Isolation', 'Beginner', ['Rhomboids'], 'Middle & Lower Traps'],
  ['Upright Rows', 'Traps', ['Traps', 'Shoulders'], 'Barbell', 'Compound', 'Intermediate', ['Lateral Delts', 'Biceps'], 'Upper Traps & Lateral Delts', ['Barbell Upright Row']],
  ['Wide Grip Upright Rows', 'Traps', ['Traps', 'Shoulders'], 'Barbell', 'Compound', 'Intermediate', ['Lateral Delts'], 'Upper Traps & Side Delts'],
  ['Trap Bar Shrugs', 'Traps', ['Traps'], 'Trap Bar', 'Isolation', 'Beginner', ['Forearms'], 'Upper Trapezius'],
  ['Y Raises', 'Traps', ['Traps', 'Shoulders'], 'Dumbbell', 'Isolation', 'Beginner', ['Rear Delts'], 'Lower Trapezius'],
  ['Prone Y Raises', 'Traps', ['Traps', 'Shoulders'], 'Dumbbell', 'Isolation', 'Beginner', ['Rear Delts'], 'Lower Trapezius'],

  // ================= 10. NECK =================
  ['Neck Flexion', 'Neck', ['Neck'], 'Bodyweight', 'Isolation', 'Beginner', [], 'Sternocleidomastoid'],
  ['Neck Extension', 'Neck', ['Neck'], 'Bodyweight', 'Isolation', 'Beginner', ['Upper Traps'], 'Cervical Extensors'],
  ['Neck Lateral Flexion', 'Neck', ['Neck'], 'Bodyweight', 'Isolation', 'Beginner', [], 'Lateral Neck Flexors'],
  ['Neck Isometric Holds', 'Neck', ['Neck'], 'Bodyweight', 'Isolation', 'Beginner', [], 'Deep Cervical Stabilizers'],
  ['Neck Harness Flexion', 'Neck', ['Neck'], 'Other', 'Isolation', 'Intermediate', [], 'Anterior Neck Flexors'],
  ['Neck Harness Extension', 'Neck', ['Neck'], 'Other', 'Isolation', 'Intermediate', ['Upper Traps'], 'Posterior Neck Extensors'],
  ['Neck Resistance Band Exercises', 'Neck', ['Neck'], 'Band', 'Isolation', 'Beginner', [], 'Multi-Planar Neck Muscles'],

  // ================= 11. CARDIO =================
  ['Treadmill Walking', 'Cardio', ['Cardio'], 'Cardio Machine', 'Cardio', 'Beginner', ['Calves', 'Glutes'], 'Aerobic Endurance'],
  ['Treadmill Running', 'Cardio', ['Cardio'], 'Cardio Machine', 'Cardio', 'Intermediate', ['Quads', 'Calves', 'Hamstrings'], 'Cardiorespiratory Fitness'],
  ['Incline Walking', 'Cardio', ['Cardio'], 'Cardio Machine', 'Cardio', 'Beginner', ['Glutes', 'Calves'], 'Zone-2 Aerobic Capacity', ['Incline Treadmill Walk']],
  ['Sprinting', 'Cardio', ['Cardio'], 'Cardio Machine', 'Cardio', 'Advanced', ['Hamstrings', 'Glutes', 'Calves'], 'Anaerobic Power', ['Treadmill Sprint Intervals']],
  ['Stationary Cycling', 'Cardio', ['Cardio'], 'Cardio Machine', 'Cardio', 'Beginner', ['Quads', 'Calves'], 'Aerobic Conditioning'],
  ['Outdoor Cycling', 'Cardio', ['Cardio'], 'Other', 'Cardio', 'Beginner', ['Quads', 'Glutes'], 'Cardiorespiratory Endurance'],
  ['Elliptical', 'Cardio', ['Cardio'], 'Cardio Machine', 'Cardio', 'Beginner', ['Arms', 'Legs'], 'Low-Impact Cardio', ['Elliptical Trainer']],
  ['Stair Climber', 'Cardio', ['Cardio'], 'Cardio Machine', 'Cardio', 'Intermediate', ['Glutes', 'Quads', 'Calves'], 'Lower-Body Aerobic Endurance', ['StairMaster Climb']],
  ['Rowing Machine', 'Cardio', ['Cardio'], 'Cardio Machine', 'Cardio', 'Intermediate', ['Back', 'Legs', 'Core'], 'Full-Body Conditioning', ['Rowing Ergometer']],
  ['Jump Rope', 'Cardio', ['Cardio'], 'Other', 'Cardio', 'Beginner', ['Calves', 'Forearms', 'Shoulders'], 'Conditioning & Footwork'],
  ['Battle Ropes', 'Cardio', ['Cardio'], 'Other', 'Cardio', 'Intermediate', ['Shoulders', 'Core', 'Forearms'], 'Upper-Body Conditioning'],
  ['Swimming', 'Cardio', ['Cardio'], 'Bodyweight', 'Cardio', 'Intermediate', ['Lats', 'Shoulders', 'Core'], 'Full-Body Low-Impact Cardio'],
  ['Burpees', 'Cardio', ['Cardio', 'Full Body'], 'Bodyweight', 'Cardio', 'Intermediate', ['Chest', 'Quads', 'Core'], 'Full-Body Conditioning'],
  ['Jumping Jacks', 'Cardio', ['Cardio'], 'Bodyweight', 'Cardio', 'Beginner', ['Calves', 'Shoulders'], 'Warmup & Aerobic Conditioning'],
  ['High Knees', 'Cardio', ['Cardio'], 'Bodyweight', 'Cardio', 'Beginner', ['Hip Flexors', 'Calves'], 'Speed & Conditioning'],
  ['Box Jumps', 'Cardio', ['Cardio', 'Legs'], 'Other', 'Compound', 'Intermediate', ['Glutes', 'Quads', 'Calves'], 'Lower-Body Explosive Power'],

  // ================= 12. GLUTES (GLUTE MEDIUS & HIP STABILITY) =================
  ['Clamshells', 'Glutes', ['Glutes'], 'Band', 'Isolation', 'Beginner', [], 'Gluteus Medius & External Rotators'],
  ['Banded Side Walks', 'Glutes', ['Glutes'], 'Band', 'Isolation', 'Beginner', ['Quads'], 'Gluteus Medius'],
  ['Monster Walks', 'Glutes', ['Glutes'], 'Band', 'Isolation', 'Beginner', ['Quads', 'Hamstrings'], 'Gluteus Medius & Hip Stability'],
  ['Single Leg Romanian Deadlift', 'Glutes', ['Glutes', 'Legs'], 'Dumbbell', 'Compound', 'Intermediate', ['Hamstrings', 'Core'], 'Glutes, Hamstrings & Balance'],
  ['Fire Hydrants', 'Glutes', ['Glutes'], 'Bodyweight', 'Isolation', 'Beginner', ['Core'], 'Gluteus Medius'],
  ['Standing Hip Abduction', 'Glutes', ['Glutes'], 'Band', 'Isolation', 'Beginner', ['Core'], 'Gluteus Medius'],
  ['Side Lying Leg Raises', 'Glutes', ['Glutes'], 'Bodyweight', 'Isolation', 'Beginner', [], 'Gluteus Medius'],
  ['Lateral Step-Ups', 'Glutes', ['Glutes', 'Legs'], 'Dumbbell', 'Compound', 'Beginner', ['Quads'], 'Gluteus Medius & Maximus'],

  // ================= 13. FULL BODY & COMPOUND =================
  ['Clean and Jerk', 'Full Body', ['Full Body'], 'Barbell', 'Compound', 'Advanced', ['Shoulders', 'Triceps', 'Back'], 'Full-Body Olympic Power'],
  ['Power Clean', 'Full Body', ['Full Body'], 'Barbell', 'Compound', 'Advanced', ['Traps', 'Hamstrings', 'Quads'], 'Explosive Triple Extension', ['Barbell Power Clean']],
  ['Hang Clean', 'Full Body', ['Full Body'], 'Barbell', 'Compound', 'Advanced', ['Traps', 'Glutes', 'Quads'], 'Explosive Hip Drive'],
  ['Snatch', 'Full Body', ['Full Body'], 'Barbell', 'Compound', 'Advanced', ['Shoulders', 'Back', 'Quads'], 'Full-Body Explosive Power'],
  ['Thrusters', 'Full Body', ['Full Body', 'Legs', 'Shoulders'], 'Barbell', 'Compound', 'Intermediate', ['Quads', 'Shoulders', 'Core'], 'Quads, Glutes & Shoulders', ['Dumbbell Thrusters']],
  ['Kettlebell Swings', 'Full Body', ['Full Body', 'Glutes'], 'Kettlebell', 'Compound', 'Beginner', ['Hamstrings', 'Core', 'Back'], 'Posterior Chain Power'],
  ['Turkish Get-Up', 'Full Body', ['Full Body'], 'Kettlebell', 'Compound', 'Advanced', ['Shoulders', 'Core', 'Hips'], 'Total-Body Stability'],
  ['Man Makers', 'Full Body', ['Full Body'], 'Dumbbell', 'Compound', 'Advanced', ['Chest', 'Back', 'Shoulders', 'Legs'], 'Total-Body Strength & Conditioning'],
  ['Clean and Press', 'Full Body', ['Full Body'], 'Barbell', 'Compound', 'Intermediate', ['Back', 'Shoulders', 'Legs'], 'Total-Body Strength'],
  ['Push Press', 'Full Body', ['Full Body', 'Shoulders'], 'Barbell', 'Compound', 'Intermediate', ['Shoulders', 'Triceps', 'Quads'], 'Shoulders & Lower-Body Drive'],
  ['Bear Complex', 'Full Body', ['Full Body'], 'Barbell', 'Compound', 'Advanced', ['Back', 'Legs', 'Shoulders'], 'Full-Body Barbell Conditioning'],

  // ================= 14. CALISTHENICS =================
  ['Muscle-Ups', 'Calisthenics', ['Calisthenics', 'Back'], 'Bodyweight', 'Compound', 'Advanced', ['Lats', 'Chest', 'Triceps', 'Core'], 'Latissimus Dorsi & Triceps'],
  ['Archer Push-Ups', 'Calisthenics', ['Calisthenics', 'Chest'], 'Bodyweight', 'Compound', 'Intermediate', ['Triceps', 'Shoulders', 'Core'], 'Unilateral Pectorals'],
  ['Pike Push-Ups', 'Calisthenics', ['Calisthenics', 'Shoulders'], 'Bodyweight', 'Compound', 'Intermediate', ['Triceps', 'Upper Chest'], 'Anterior & Lateral Deltoids'],
  ['Handstand Push-Ups', 'Calisthenics', ['Calisthenics', 'Shoulders'], 'Bodyweight', 'Compound', 'Advanced', ['Triceps', 'Traps', 'Core'], 'Deltoids & Overhead Stability'],
  ['Australian Pull-Ups', 'Calisthenics', ['Calisthenics', 'Back'], 'Bodyweight', 'Compound', 'Beginner', ['Biceps', 'Rear Delts'], 'Middle Back & Lats'],
  ['Shrimp Squats', 'Calisthenics', ['Calisthenics', 'Legs'], 'Bodyweight', 'Compound', 'Advanced', ['Glutes', 'Balance'], 'Unilateral Quadriceps'],
  ['L-Sit', 'Calisthenics', ['Calisthenics', 'Abs'], 'Bodyweight', 'Isolation', 'Intermediate', ['Hip Flexors', 'Triceps'], 'Core Compression & Shoulder Depression'],
  ['Front Lever', 'Calisthenics', ['Calisthenics', 'Back'], 'Bodyweight', 'Compound', 'Advanced', ['Lats', 'Abs', 'Rear Delts'], 'Latissimus Dorsi & Core'],
  ['Back Lever', 'Calisthenics', ['Calisthenics', 'Back'], 'Bodyweight', 'Compound', 'Advanced', ['Shoulders', 'Biceps', 'Core'], 'Posterior Chain & Biceps Tendons'],
  ['Human Flag', 'Calisthenics', ['Calisthenics', 'Abs'], 'Bodyweight', 'Compound', 'Advanced', ['Obliques', 'Shoulders', 'Lats'], 'Lateral Core & Shoulder Stability'],
  ['Planche', 'Calisthenics', ['Calisthenics', 'Shoulders'], 'Bodyweight', 'Compound', 'Advanced', ['Front Delts', 'Chest', 'Core'], 'Anterior Deltoids & Straight-Arm Strength'],
  ['Handstand', 'Calisthenics', ['Calisthenics', 'Shoulders'], 'Bodyweight', 'Compound', 'Intermediate', ['Traps', 'Core', 'Wrists'], 'Shoulder & Core Balance'],

  // ================= 15. MOBILITY =================
  ['Cat Cow Stretch', 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Beginner', ['Abs', 'Neck'], 'Thoracic & Lumbar Spine Mobility'],
  ["Child's Pose", 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Beginner', ['Hips', 'Shoulders'], 'Latissimus Dorsi & Lower Back'],
  ['Cobra Stretch', 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Beginner', ['Chest', 'Hip Flexors'], 'Abdominals & Thoracic Extension'],
  ['Downward Dog', 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Beginner', ['Shoulders', 'Calves'], 'Hamstrings, Calves & Shoulders'],
  ["World's Greatest Stretch", 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Beginner', ['Quads', 'Shoulders'], 'Hip Flexors, Groin & Thoracic Spine'],
  ['Shoulder Dislocations', 'Mobility', ['Mobility'], 'Other', 'Mobility', 'Beginner', ['Chest'], 'Shoulder Capsule & Pectorals'],
  ['Doorway Chest Stretch', 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Beginner', ['Front Delts'], 'Pectoralis Major & Minor'],
  ['Lat Stretch', 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Beginner', ['Teres Major'], 'Latissimus Dorsi'],
  ['Triceps Stretch', 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Beginner', ['Shoulders'], 'Triceps Long Head'],
  ['Biceps Wall Stretch', 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Beginner', ['Chest', 'Front Delts'], 'Biceps Brachii & Anterior Shoulder'],
  ['Wrist Flexor Stretch', 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Beginner', [], 'Forearm Flexors'],
  ['Wrist Extensor Stretch', 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Beginner', [], 'Forearm Extensors'],
  ['Couch Stretch', 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Intermediate', ['Glutes'], 'Rectus Femoris & Hip Flexors'],
  ['Hamstring Stretch', 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Beginner', ['Calves'], 'Hamstrings'],
  ['Standing Quad Stretch', 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Beginner', ['Hip Flexors'], 'Quadriceps'],
  ['Calf Stretch', 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Beginner', ['Ankles'], 'Gastrocnemius & Soleus'],
  ['Pigeon Pose', 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Intermediate', ['Lower Back'], 'Glutes & Piriformis'],
  ['Hip Flexor Stretch', 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Beginner', ['Quads'], 'Iliopsoas & Hip Capsule'],
  ['Ankle Mobility Drill', 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Beginner', ['Calves'], 'Ankle Dorsiflexion'],
  ['Thoracic Spine Rotation', 'Mobility', ['Mobility'], 'Bodyweight', 'Mobility', 'Beginner', ['Shoulders'], 'Thoracic Spine Mobility'],
];

function makeCanonicalUuid(index: number): string {
  const tail = index.toString(16).padStart(12, '0');
  return `a0000000-0000-4000-8000-${tail}`;
}

export const MASTER_EXERCISE_CATALOG: ExerciseItem[] = MASTER_TUPLES.map(
  (
    [
      name,
      primaryCategory,
      categories,
      equipment,
      exerciseType,
      difficulty,
      secondaryMuscles,
      targetMuscle,
      aliases,
      instructions,
      commonMistakes,
    ],
    idx
  ) => {
    const resolvedCats = categories && categories.length > 0 ? categories : [primaryCategory];
    const resolvedEquip = equipment ?? inferEquipment(name);
    const resolvedType = exerciseType ?? inferType(name, primaryCategory);
    const resolvedDiff = difficulty ?? inferDifficulty(name, primaryCategory);
    const resolvedSec = secondaryMuscles ?? defaultSecondary(primaryCategory);
    const resolvedTarget = targetMuscle ?? defaultTargetMuscle(name, primaryCategory);

    return {
      id: makeCanonicalUuid(idx + 1),
      name,
      category: primaryCategory,
      categories: resolvedCats,
      primary_muscle: primaryCategory,
      secondary_muscles: resolvedSec,
      equipment: resolvedEquip,
      exercise_type: resolvedType,
      difficulty: resolvedDiff,
      target_muscle: resolvedTarget,
      aliases: aliases ?? [],
      instructions: instructions ?? defaultInstructions(name, resolvedType),
      common_mistakes: commonMistakes ?? defaultMistakes(name, resolvedType),
      media_url: null,
      is_compound: resolvedType === 'Compound',
      is_custom: false,
    };
  }
);
