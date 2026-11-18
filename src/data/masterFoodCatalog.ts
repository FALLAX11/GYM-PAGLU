import type { FoodCategory, FoodItem } from '../types/database';

interface RawFoodSeed {
  id: string;
  name: string;
  category: FoodCategory;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  aliases?: string[];
}

const RAW_FOOD_SEEDS: RawFoodSeed[] = [
  // Rice
  { id: 'food-001', name: 'Steamed Basmati Rice (Cooked)', category: 'Rice', serving_size: 100, serving_unit: 'g', calories: 130, protein_g: 2.7, carbs_g: 28.2, fat_g: 0.3, fibre_g: 0.4, aliases: ['chawal', 'white rice', 'basmati'] },
  { id: 'food-002', name: 'Brown Rice (Cooked)', category: 'Rice', serving_size: 100, serving_unit: 'g', calories: 112, protein_g: 2.6, carbs_g: 23.5, fat_g: 0.9, fibre_g: 1.8, aliases: ['brown chawal'] },
  { id: 'food-003', name: 'Jeera Rice', category: 'Rice', serving_size: 150, serving_unit: 'g', calories: 235, protein_g: 4.1, carbs_g: 41.0, fat_g: 5.8, fibre_g: 0.8, aliases: ['cumin rice'] },
  { id: 'food-043', name: 'Sona Masoori / White Rice (Cooked)', category: 'Rice', serving_size: 150, serving_unit: 'g', calories: 195, protein_g: 4.0, carbs_g: 42.0, fat_g: 0.4, fibre_g: 0.6, aliases: ['chawal', 'boiled rice'] },
  { id: 'food-044', name: 'Quinoa (Cooked)', category: 'Rice', serving_size: 100, serving_unit: 'g', calories: 120, protein_g: 4.4, carbs_g: 21.3, fat_g: 1.9, fibre_g: 2.8, aliases: ['grain'] },
  { id: 'food-045', name: 'Khichdi (Moong Dal & Rice)', category: 'Rice', serving_size: 200, serving_unit: 'g', calories: 230, protein_g: 8.6, carbs_g: 39.5, fat_g: 3.8, fibre_g: 3.4, aliases: ['dal khichdi'] },

  // Roti & Breads
  { id: 'food-004', name: 'Whole Wheat Roti / Chapati', category: 'Roti', serving_size: 1, serving_unit: 'piece (40g)', calories: 104, protein_g: 3.2, carbs_g: 20.4, fat_g: 0.8, fibre_g: 2.8, aliases: ['phulka', 'chapatti', 'atta roti'] },
  { id: 'food-005', name: 'Tandoori Roti (Whole Wheat)', category: 'Roti', serving_size: 1, serving_unit: 'piece (55g)', calories: 142, protein_g: 4.4, carbs_g: 28.0, fat_g: 1.1, fibre_g: 3.6, aliases: ['tandoor roti'] },
  { id: 'food-006', name: 'Multigrain Bhakri / Roti', category: 'Roti', serving_size: 1, serving_unit: 'piece (50g)', calories: 130, protein_g: 4.0, carbs_g: 24.5, fat_g: 1.4, fibre_g: 3.8, aliases: ['jowar roti', 'bajra roti'] },
  { id: 'food-046', name: 'Ghee Paratha (Whole Wheat)', category: 'Roti', serving_size: 1, serving_unit: 'piece (65g)', calories: 210, protein_g: 4.5, carbs_g: 28.0, fat_g: 8.8, fibre_g: 3.0, aliases: ['plain paratha'] },
  { id: 'food-047', name: 'Whole Wheat / Brown Bread', category: 'Roti', serving_size: 2, serving_unit: 'slices (56g)', calories: 144, protein_g: 5.4, carbs_g: 26.8, fat_g: 1.8, fibre_g: 3.4, aliases: ['toast', 'atta bread'] },

  // Dal & Legumes
  { id: 'food-007', name: 'Yellow Moong Dal (Cooked)', category: 'Dal', serving_size: 150, serving_unit: 'g', calories: 158, protein_g: 10.5, carbs_g: 24.2, fat_g: 2.1, fibre_g: 5.4, aliases: ['mung dal'] },
  { id: 'food-008', name: 'Toor / Arhar Dal Tadka', category: 'Dal', serving_size: 150, serving_unit: 'g', calories: 180, protein_g: 9.2, carbs_g: 23.0, fat_g: 5.5, fibre_g: 4.9, aliases: ['dal fry', 'pigeon pea'] },
  { id: 'food-009', name: 'Masoor Dal (Cooked)', category: 'Dal', serving_size: 150, serving_unit: 'g', calories: 165, protein_g: 11.2, carbs_g: 25.0, fat_g: 2.0, fibre_g: 5.8, aliases: ['red lentil'] },
  { id: 'food-010', name: 'Rajma Masala (Home-style)', category: 'Dal', serving_size: 150, serving_unit: 'g', calories: 210, protein_g: 11.4, carbs_g: 29.0, fat_g: 5.0, fibre_g: 8.2, aliases: ['kidney beans'] },
  { id: 'food-048', name: 'Kabuli Chana / Chole (Cooked)', category: 'Dal', serving_size: 150, serving_unit: 'g', calories: 225, protein_g: 11.8, carbs_g: 33.5, fat_g: 4.5, fibre_g: 8.8, aliases: ['chickpeas', 'chhole'] },
  { id: 'food-049', name: 'Kala Chana (Boiled)', category: 'Dal', serving_size: 100, serving_unit: 'g', calories: 164, protein_g: 8.9, carbs_g: 27.4, fat_g: 2.6, fibre_g: 7.6, aliases: ['black chickpeas', 'desi chana'] },
  { id: 'food-050', name: 'Soya Chunks (Dry)', category: 'Dal', serving_size: 50, serving_unit: 'g', calories: 172, protein_g: 26.0, carbs_g: 16.5, fat_g: 0.3, fibre_g: 6.5, aliases: ['soybean chunks', 'nutrela', 'soy'] },

  // Vegetables & Tubers
  { id: 'food-011', name: 'Broccoli (Steamed)', category: 'Vegetables', serving_size: 100, serving_unit: 'g', calories: 35, protein_g: 2.4, carbs_g: 7.2, fat_g: 0.4, fibre_g: 3.3, aliases: ['greens'] },
  { id: 'food-012', name: 'Palak Sabzi (Spinach Stir-Fry)', category: 'Vegetables', serving_size: 150, serving_unit: 'g', calories: 95, protein_g: 4.5, carbs_g: 7.8, fat_g: 5.1, fibre_g: 3.9, aliases: ['spinach'] },
  { id: 'food-013', name: 'Mixed Veg Sabzi (Low Oil)', category: 'Vegetables', serving_size: 150, serving_unit: 'g', calories: 115, protein_g: 3.6, carbs_g: 15.0, fat_g: 4.2, fibre_g: 4.5, aliases: ['sabji', 'mix veg'] },
  { id: 'food-051', name: 'Sweet Potato (Boiled)', category: 'Vegetables', serving_size: 150, serving_unit: 'g', calories: 129, protein_g: 2.4, carbs_g: 30.0, fat_g: 0.2, fibre_g: 4.5, aliases: ['shakarkandi'] },
  { id: 'food-052', name: 'Potato (Boiled)', category: 'Vegetables', serving_size: 150, serving_unit: 'g', calories: 130, protein_g: 2.8, carbs_g: 30.2, fat_g: 0.2, fibre_g: 2.7, aliases: ['aloo'] },
  { id: 'food-053', name: 'Cucumber Tomato Salad', category: 'Vegetables', serving_size: 150, serving_unit: 'g', calories: 32, protein_g: 1.4, carbs_g: 6.4, fat_g: 0.3, fibre_g: 2.0, aliases: ['kachumber', 'kheera'] },
  { id: 'food-054', name: 'Bhindi Masala (Low Oil)', category: 'Vegetables', serving_size: 150, serving_unit: 'g', calories: 112, protein_g: 2.9, carbs_g: 11.4, fat_g: 6.0, fibre_g: 4.6, aliases: ['okra', 'ladyfinger'] },

  // Eggs
  { id: 'food-014', name: 'Whole Egg (Boiled)', category: 'Eggs', serving_size: 1, serving_unit: 'egg (50g)', calories: 78, protein_g: 6.3, carbs_g: 0.6, fat_g: 5.3, fibre_g: 0, aliases: ['anda', 'boiled egg'] },
  { id: 'food-015', name: 'Egg Whites (Boiled)', category: 'Eggs', serving_size: 1, serving_unit: 'white (33g)', calories: 17, protein_g: 3.6, carbs_g: 0.2, fat_g: 0.1, fibre_g: 0, aliases: ['safedi', 'egg white'] },
  { id: 'food-016', name: 'Masala Omelette (2 Eggs)', category: 'Eggs', serving_size: 1, serving_unit: 'serving', calories: 195, protein_g: 13.0, carbs_g: 2.5, fat_g: 14.5, fibre_g: 0.5, aliases: ['anda omelette'] },
  { id: 'food-055', name: 'Egg Bhurji (3 Whole Eggs)', category: 'Eggs', serving_size: 1, serving_unit: 'serving', calories: 275, protein_g: 19.2, carbs_g: 4.2, fat_g: 19.8, fibre_g: 0.8, aliases: ['scrambled eggs'] },
  { id: 'food-056', name: 'Egg White Omelette (4 Whites)', category: 'Eggs', serving_size: 1, serving_unit: 'serving', calories: 85, protein_g: 14.6, carbs_g: 1.2, fat_g: 2.2, fibre_g: 0.2, aliases: ['white omelette'] },

  // Milk & Dairy
  { id: 'food-017', name: 'Toned Milk (3% Fat)', category: 'Milk', serving_size: 250, serving_unit: 'ml', calories: 150, protein_g: 7.5, carbs_g: 12.2, fat_g: 7.5, fibre_g: 0, aliases: ['doodh', 'milk'] },
  { id: 'food-018', name: 'Skim Milk', category: 'Milk', serving_size: 250, serving_unit: 'ml', calories: 90, protein_g: 8.5, carbs_g: 12.5, fat_g: 0.5, fibre_g: 0, aliases: ['fat free milk', 'double toned'] },
  { id: 'food-019', name: 'Low-Fat Curd / Dahi', category: 'Milk', serving_size: 150, serving_unit: 'g', calories: 95, protein_g: 6.2, carbs_g: 7.8, fat_g: 4.0, fibre_g: 0, aliases: ['yogurt', 'dahi'] },
  { id: 'food-057', name: 'Greek Yogurt (Plain / High Protein)', category: 'Milk', serving_size: 150, serving_unit: 'g', calories: 100, protein_g: 15.0, carbs_g: 6.0, fat_g: 1.5, fibre_g: 0, aliases: ['hung curd', 'epigamia'] },
  { id: 'food-058', name: 'Full Cream Milk', category: 'Milk', serving_size: 250, serving_unit: 'ml', calories: 215, protein_g: 8.2, carbs_g: 12.0, fat_g: 15.0, fibre_g: 0, aliases: ['whole milk', 'doodh'] },
  { id: 'food-059', name: 'Chaas / Buttermilk (Spiced)', category: 'Milk', serving_size: 250, serving_unit: 'ml', calories: 48, protein_g: 2.6, carbs_g: 4.2, fat_g: 2.1, fibre_g: 0, aliases: ['mattha', 'lassi'] },

  // Paneer & Tofu
  { id: 'food-020', name: 'Fresh Paneer (Cow Milk)', category: 'Paneer', serving_size: 100, serving_unit: 'g', calories: 265, protein_g: 18.3, carbs_g: 3.4, fat_g: 20.8, fibre_g: 0, aliases: ['cottage cheese'] },
  { id: 'food-021', name: 'Low-Fat Paneer', category: 'Paneer', serving_size: 100, serving_unit: 'g', calories: 175, protein_g: 21.0, carbs_g: 3.5, fat_g: 8.2, fibre_g: 0, aliases: ['protein paneer', 'lean paneer'] },
  { id: 'food-022', name: 'Paneer Bhurji (Low Oil)', category: 'Paneer', serving_size: 150, serving_unit: 'g', calories: 285, protein_g: 21.5, carbs_g: 6.5, fat_g: 19.0, fibre_g: 1.2, aliases: ['scrambled paneer'] },
  { id: 'food-060', name: 'Firm Tofu', category: 'Paneer', serving_size: 100, serving_unit: 'g', calories: 120, protein_g: 13.5, carbs_g: 2.5, fat_g: 6.5, fibre_g: 1.2, aliases: ['soy paneer', 'vegan'] },
  { id: 'food-061', name: 'Grilled Paneer Tikka', category: 'Paneer', serving_size: 150, serving_unit: 'g', calories: 310, protein_g: 22.0, carbs_g: 6.8, fat_g: 21.5, fibre_g: 0.9, aliases: ['tikka'] },

  // Chicken
  { id: 'food-023', name: 'Chicken Breast (Grilled / Boiled)', category: 'Chicken', serving_size: 100, serving_unit: 'g', calories: 165, protein_g: 31.0, carbs_g: 0, fat_g: 3.6, fibre_g: 0, aliases: ['murgh', 'lean chicken'] },
  { id: 'food-024', name: 'Tandoori Chicken Breast', category: 'Chicken', serving_size: 150, serving_unit: 'g', calories: 255, protein_g: 42.0, carbs_g: 3.2, fat_g: 7.5, fibre_g: 0.4, aliases: ['chicken tikka'] },
  { id: 'food-025', name: 'Chicken Curry (Home-style)', category: 'Chicken', serving_size: 200, serving_unit: 'g', calories: 295, protein_g: 28.5, carbs_g: 8.2, fat_g: 16.0, fibre_g: 1.5, aliases: ['murgh curry'] },
  { id: 'food-062', name: 'Chicken Thigh (Skinless Cooked)', category: 'Chicken', serving_size: 100, serving_unit: 'g', calories: 195, protein_g: 24.8, carbs_g: 0, fat_g: 10.2, fibre_g: 0, aliases: ['boneless thigh'] },
  { id: 'food-063', name: 'Chicken Keema (Low Oil)', category: 'Chicken', serving_size: 150, serving_unit: 'g', calories: 245, protein_g: 31.5, carbs_g: 4.5, fat_g: 10.8, fibre_g: 0.8, aliases: ['minced chicken'] },

  // Fish & Seafood
  { id: 'food-026', name: 'Rohu Fish Curry (Home-style)', category: 'Fish', serving_size: 150, serving_unit: 'g', calories: 215, protein_g: 24.0, carbs_g: 5.2, fat_g: 10.5, fibre_g: 0.8, aliases: ['machli'] },
  { id: 'food-027', name: 'Grilled Salmon Fillet', category: 'Fish', serving_size: 100, serving_unit: 'g', calories: 208, protein_g: 20.4, carbs_g: 0, fat_g: 13.4, fibre_g: 0, aliases: ['salmon'] },
  { id: 'food-064', name: 'Prawns / Shrimp (Grilled)', category: 'Fish', serving_size: 100, serving_unit: 'g', calories: 99, protein_g: 23.8, carbs_g: 0.2, fat_g: 0.3, fibre_g: 0, aliases: ['jhinga', 'shrimp'] },
  { id: 'food-065', name: 'Canned Tuna in Water', category: 'Fish', serving_size: 100, serving_unit: 'g', calories: 116, protein_g: 25.5, carbs_g: 0, fat_g: 0.8, fibre_g: 0, aliases: ['tuna'] },

  // Oats & Breakfast Cereals
  { id: 'food-028', name: 'Rolled Oats (Dry)', category: 'Oats', serving_size: 50, serving_unit: 'g', calories: 190, protein_g: 6.8, carbs_g: 33.5, fat_g: 3.4, fibre_g: 5.2, aliases: ['oatmeal', 'dalia'] },
  { id: 'food-066', name: 'Masala Oats (Dry Mix)', category: 'Oats', serving_size: 40, serving_unit: 'g', calories: 148, protein_g: 4.6, carbs_g: 26.5, fat_g: 2.6, fibre_g: 3.8, aliases: ['savory oats'] },
  { id: 'food-067', name: 'Wheat Dalia (Broken Wheat, Dry)', category: 'Oats', serving_size: 50, serving_unit: 'g', calories: 172, protein_g: 5.8, carbs_g: 35.5, fat_g: 0.8, fibre_g: 5.5, aliases: ['porridge', 'lapsi'] },
  { id: 'food-068', name: 'Muesli (No Added Sugar)', category: 'Oats', serving_size: 50, serving_unit: 'g', calories: 185, protein_g: 5.2, carbs_g: 32.0, fat_g: 3.5, fibre_g: 4.5, aliases: ['cereal'] },

  // Fruits
  { id: 'food-029', name: 'Banana (Medium)', category: 'Fruits', serving_size: 1, serving_unit: 'piece (118g)', calories: 105, protein_g: 1.3, carbs_g: 27.0, fat_g: 0.4, fibre_g: 3.1, aliases: ['kela'] },
  { id: 'food-030', name: 'Apple (Medium)', category: 'Fruits', serving_size: 1, serving_unit: 'piece (180g)', calories: 95, protein_g: 0.5, carbs_g: 25.0, fat_g: 0.3, fibre_g: 4.4, aliases: ['seb'] },
  { id: 'food-031', name: 'Papaya (Diced)', category: 'Fruits', serving_size: 150, serving_unit: 'g', calories: 65, protein_g: 0.7, carbs_g: 16.2, fat_g: 0.4, fibre_g: 2.6, aliases: ['papita'] },
  { id: 'food-069', name: 'Pomegranate Seeds (Anar)', category: 'Fruits', serving_size: 100, serving_unit: 'g', calories: 83, protein_g: 1.7, carbs_g: 18.7, fat_g: 1.2, fibre_g: 4.0, aliases: ['anar'] },
  { id: 'food-070', name: 'Watermelon (Diced)', category: 'Fruits', serving_size: 200, serving_unit: 'g', calories: 60, protein_g: 1.2, carbs_g: 15.2, fat_g: 0.3, fibre_g: 0.8, aliases: ['tarbooz'] },
  { id: 'food-071', name: 'Mango (Diced)', category: 'Fruits', serving_size: 150, serving_unit: 'g', calories: 90, protein_g: 1.2, carbs_g: 22.5, fat_g: 0.6, fibre_g: 2.4, aliases: ['aam'] },

  // Nuts, Seeds & Fats
  { id: 'food-032', name: 'Almonds (Raw)', category: 'Nuts', serving_size: 28, serving_unit: 'g', calories: 164, protein_g: 6.0, carbs_g: 6.1, fat_g: 14.2, fibre_g: 3.5, aliases: ['badam'] },
  { id: 'food-033', name: 'Natural Peanut Butter', category: 'Nuts', serving_size: 32, serving_unit: 'g (2 tbsp)', calories: 190, protein_g: 8.0, carbs_g: 6.0, fat_g: 16.0, fibre_g: 2.5, aliases: ['pb', 'mungfali'] },
  { id: 'food-034', name: 'Walnuts', category: 'Nuts', serving_size: 28, serving_unit: 'g', calories: 185, protein_g: 4.3, carbs_g: 3.9, fat_g: 18.5, fibre_g: 1.9, aliases: ['akhrot'] },
  { id: 'food-072', name: 'Roasted Peanuts', category: 'Nuts', serving_size: 30, serving_unit: 'g', calories: 176, protein_g: 7.4, carbs_g: 5.2, fat_g: 14.8, fibre_g: 2.5, aliases: ['moongfali', 'singdana'] },
  { id: 'food-073', name: 'Chia / Flax Seeds Mix', category: 'Nuts', serving_size: 15, serving_unit: 'g (1 tbsp)', calories: 76, protein_g: 2.7, carbs_g: 5.5, fat_g: 5.2, fibre_g: 4.6, aliases: ['alsi', 'seeds'] },
  { id: 'food-074', name: 'Desi Ghee / Olive Oil', category: 'Nuts', serving_size: 5, serving_unit: 'g (1 tsp)', calories: 45, protein_g: 0, carbs_g: 0, fat_g: 5.0, fibre_g: 0, aliases: ['ghee', 'cooking oil', 'tel'] },

  // Whey & Supplements
  { id: 'food-035', name: 'Whey Protein Isolate (1 Scoop)', category: 'Whey protein', serving_size: 30, serving_unit: 'g', calories: 115, protein_g: 25.0, carbs_g: 1.8, fat_g: 0.8, fibre_g: 0, aliases: ['whey', 'iso', 'protein powder'] },
  { id: 'food-036', name: 'Whey Protein Concentrate (1 Scoop)', category: 'Whey protein', serving_size: 32, serving_unit: 'g', calories: 126, protein_g: 24.0, carbs_g: 3.0, fat_g: 1.8, fibre_g: 0, aliases: ['whey', 'protein shake'] },
  { id: 'food-075', name: 'Plant / Pea Protein (1 Scoop)', category: 'Whey protein', serving_size: 33, serving_unit: 'g', calories: 125, protein_g: 23.0, carbs_g: 3.5, fat_g: 2.0, fibre_g: 1.8, aliases: ['vegan protein'] },
  { id: 'food-076', name: 'Casein Protein (1 Scoop)', category: 'Whey protein', serving_size: 33, serving_unit: 'g', calories: 122, protein_g: 24.0, carbs_g: 3.2, fat_g: 1.2, fibre_g: 0, aliases: ['night protein'] },

  // Other Indian Foods
  { id: 'food-037', name: 'Poha (Vegetable)', category: 'Other Indian foods', serving_size: 150, serving_unit: 'g', calories: 210, protein_g: 4.5, carbs_g: 37.5, fat_g: 4.8, fibre_g: 2.4, aliases: ['kanda poha'] },
  { id: 'food-038', name: 'Idli (Steamed)', category: 'Other Indian foods', serving_size: 2, serving_unit: 'pieces (120g)', calories: 140, protein_g: 4.4, carbs_g: 28.0, fat_g: 0.8, fibre_g: 1.6, aliases: ['south indian'] },
  { id: 'food-039', name: 'Moong Dal Chilla (1 Medium)', category: 'Other Indian foods', serving_size: 1, serving_unit: 'piece (80g)', calories: 145, protein_g: 8.4, carbs_g: 18.5, fat_g: 3.8, fibre_g: 3.2, aliases: ['pesarattu', 'cheela'] },
  { id: 'food-040', name: 'Sprouted Moong Salad', category: 'Other Indian foods', serving_size: 100, serving_unit: 'g', calories: 98, protein_g: 7.6, carbs_g: 15.8, fat_g: 0.6, fibre_g: 4.2, aliases: ['sprouts', 'ankurit'] },
  { id: 'food-041', name: 'Sattu Drink (30g Sattu)', category: 'Other Indian foods', serving_size: 30, serving_unit: 'g', calories: 118, protein_g: 6.8, carbs_g: 19.0, fat_g: 1.6, fibre_g: 3.8, aliases: ['roasted chana flour'] },
  { id: 'food-077', name: 'Plain Masala Dosa', category: 'Other Indian foods', serving_size: 1, serving_unit: 'piece (140g)', calories: 270, protein_g: 6.2, carbs_g: 42.0, fat_g: 8.5, fibre_g: 2.8, aliases: ['dosa'] },
  { id: 'food-078', name: 'Besan Chilla (1 Medium)', category: 'Other Indian foods', serving_size: 1, serving_unit: 'piece (80g)', calories: 160, protein_g: 7.8, carbs_g: 18.0, fat_g: 6.2, fibre_g: 3.4, aliases: ['gram flour pancake', 'cheela'] },
  { id: 'food-079', name: 'Rava Upma (Vegetable)', category: 'Other Indian foods', serving_size: 150, serving_unit: 'g', calories: 225, protein_g: 5.2, carbs_g: 35.0, fat_g: 6.8, fibre_g: 2.5, aliases: ['suji upma'] },
  { id: 'food-080', name: 'Sambar (Home-style)', category: 'Other Indian foods', serving_size: 150, serving_unit: 'g', calories: 105, protein_g: 4.8, carbs_g: 14.5, fat_g: 3.0, fibre_g: 3.5, aliases: ['sambhar'] },
  { id: 'food-081', name: 'Peanut Chikki / Protein Laddu (Small)', category: 'Other Indian foods', serving_size: 30, serving_unit: 'g', calories: 145, protein_g: 4.5, carbs_g: 15.5, fat_g: 7.4, fibre_g: 1.5, aliases: ['jaggery'] },
  { id: 'food-082', name: 'Dark Chocolate (70%+ Cocoa)', category: 'Other Indian foods', serving_size: 20, serving_unit: 'g (2 squares)', calories: 118, protein_g: 1.6, carbs_g: 9.0, fat_g: 8.4, fibre_g: 2.2, aliases: ['cocoa'] },
];

export const MASTER_FOOD_CATALOG: FoodItem[] = RAW_FOOD_SEEDS.map((item) => ({
  id: item.id,
  name: item.name,
  category: item.category,
  serving_size: item.serving_size,
  serving_unit: item.serving_unit,
  calories: item.calories,
  protein_g: item.protein_g,
  carbs_g: item.carbs_g,
  fat_g: item.fat_g,
  fibre_g: item.fibre_g,
  aliases: item.aliases,
  is_custom: false,
}));

function normalizeFoodText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesFoodQuery(food: FoodItem, rawQuery: string): boolean {
  const q = normalizeFoodText(rawQuery);
  if (!q) return true;

  const haystack = normalizeFoodText(
    [food.name, food.category, ...(food.aliases ?? [])].join(' ')
  );
  const compactHaystack = haystack.replace(/\s+/g, '');
  const compactQ = q.replace(/\s+/g, '');

  if (haystack.includes(q) || compactHaystack.includes(compactQ)) return true;

  const tokens = q.split(' ').filter(Boolean);
  return tokens.every((tok) => haystack.includes(tok));
}
