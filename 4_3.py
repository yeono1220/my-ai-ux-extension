from sympy import *
import matplotlib.pyplot as plt
import numpy as np
# 행렬 및 초기값 세팅
A = Matrix([[1, 0, 1], [1, 1, 0], [-2, 0, -1]])
t = Symbol('t', real=True)
x0 = Matrix([1, 1, 1])

# Matrix Exponential 연산 및 출력
sol = simplify(exp(A*t)*x0)
print(sol)
# 범위 조건 t ∈ [0, 5] 설정 (개수는 예시와 동일하게 100개)
dt = np.linspace(0, 5, 100)

# sol 객체에서 첫 번째 성분 x(t)와 두 번째 성분 y(t) 추출
x = lambdify(t, sol[0], 'numpy')
y = lambdify(t, sol[1], 'numpy')

# 그래프 플롯 세팅 (예시 크기 3x3 반영)
plt.figure(figsize=(3, 3))
plt.plot(x(dt), y(dt))
plt.plot(x0[0], x0[1], 'ro') # 초기 위치 마킹 (1, 1)
plt.xlabel('x(t)')
plt.ylabel('y(t)')
plt.grid(True, linestyle='--', alpha=0.5)
plt.show()