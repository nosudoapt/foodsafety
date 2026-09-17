"use client";

export default function GlutenFreeMenuPage() {
  return (
    <div className="min-h-screen bg-[#fdf8e8]">
      {/* Header */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 border-b-2 border-gray-900 pb-2">
          Gluten Free Menu
        </h1>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-8 space-y-6">
        {/* GREENS */}
        <div>
          <div className="bg-green-600 px-4 py-2 rounded-t-lg">
            <h2 className="font-bold text-gray-900 uppercase tracking-wide">
              Greens (No Bread)
            </h2>
          </div>
          <div className="bg-white border border-gray-200 border-t-0 rounded-b-lg px-4 py-3">
            <ul className="space-y-2">
              <li className="flex items-start gap-2 text-sm text-gray-800">
                <span className="text-green-600 font-bold">•</span>
                Caesar Salad
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-800">
                <span className="text-green-600 font-bold">•</span>
                Greek Salad
              </li>
            </ul>
          </div>
        </div>

        {/* BURGERS */}
        <div>
          <div className="bg-orange-500 px-4 py-2 rounded-t-lg">
            <h2 className="font-bold text-gray-900 uppercase tracking-wide">
              Burgers
            </h2>
          </div>
          <div className="bg-white border border-gray-200 border-t-0 rounded-b-lg px-4 py-3">
            <ul className="space-y-2">
              <li className="flex items-start gap-2 text-sm text-gray-800">
                <span className="text-orange-500 font-bold">•</span>
                <span>
                  All burgers are gluten free <strong>except</strong> Chick N Licking, Aloo Tikki, and Fish N Chippy, Buffalo Crunch Burger
                </span>
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-800">
                <span className="text-orange-500 font-bold">•</span>
                No onion rings and pickles in So Satisfrying
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-800">
                <span className="text-orange-500 font-bold">•</span>
                No mozza sticks in Mozza Madness
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-800">
                <span className="text-orange-500 font-bold">•</span>
                All should be on a <strong>gluten free bun</strong>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom 3 Columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* SIDES */}
          <div>
            <div className="bg-orange-500 px-4 py-2 rounded-t-lg">
              <h3 className="font-bold text-gray-900 uppercase tracking-wide text-sm">
                Sides
              </h3>
            </div>
            <div className="bg-white border border-gray-200 border-t-0 rounded-b-lg px-4 py-3">
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-xs text-gray-800">
                  <span className="text-orange-500 font-bold">•</span>
                  Caesar Salad (no croutons)
                </li>
                <li className="flex items-start gap-2 text-xs text-gray-800">
                  <span className="text-orange-500 font-bold">•</span>
                  Greek Salad
                </li>
                <li className="flex items-start gap-2 text-xs text-gray-800">
                  <span className="text-orange-500 font-bold">•</span>
                  Coleslaw
                </li>
              </ul>
            </div>
          </div>

          {/* KIDS */}
          <div>
            <div className="bg-orange-500 px-4 py-2 rounded-t-lg">
              <h3 className="font-bold text-gray-900 uppercase tracking-wide text-sm">
                Kids
              </h3>
            </div>
            <div className="bg-white border border-gray-200 border-t-0 rounded-b-lg px-4 py-3">
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-xs text-gray-800">
                  <span className="text-orange-500 font-bold">•</span>
                  Cheeseburger (on gluten free bun)
                </li>
              </ul>
            </div>
          </div>

          {/* DESSERT */}
          <div>
            <div className="bg-orange-500 px-4 py-2 rounded-t-lg">
              <h3 className="font-bold text-gray-900 uppercase tracking-wide text-sm">
                Dessert
              </h3>
            </div>
            <div className="bg-white border border-gray-200 border-t-0 rounded-b-lg px-4 py-3">
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-xs text-gray-800">
                  <span className="text-orange-500 font-bold">•</span>
                  Chocolate Brownie
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pt-4">
          <p className="text-xs text-gray-500">
            © Between the Buns — Gluten Free Menu
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Always confirm with staff before ordering if you have allergies
          </p>
        </div>
      </div>
    </div>
  );
}
